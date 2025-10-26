from fastapi import FastAPI, WebSocket, Depends, HTTPException
from web3 import Web3
import json
import time
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from config.settings import settings
from models.message import Message, EditMessage
from init.db import init_db, close_db, db_pool

app = FastAPI()

# CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Web3 setup for Lisk Sepolia
w3 = Web3(Web3.HTTPProvider(settings.LISK_SEPOLIA_RPC_URL))
FACTORY_ADDRESS = settings.FACTORY_ADDRESS
with open('ContriboostFactory.abi', 'r') as f:
    FACTORY_ABI = json.load(f)
with open('Contriboost.abi', 'r') as f:
    CONTRIBOOST_ABI = json.load(f)
factory_contract = w3.eth.contract(address=FACTORY_ADDRESS, abi=FACTORY_ABI)

# Dependency to verify participant
async def verify_participant(
    address: str = Depends(APIKeyHeader(name='X-Wallet-Address')),
    contract_address: str = None
):
    try:
        if not w3.is_address(address) or not w3.is_address(contract_address):
            raise HTTPException(status_code=400, detail="Invalid address")
        
        # Verify contract exists in factory
        contriboosts = factory_contract.functions.getAllContriboostsDetails().call()
        valid_contracts = [c[0].lower() for c in contriboosts]
        if contract_address.lower() not in valid_contracts:
            raise HTTPException(status_code=400, detail="Invalid Contriboost contract")
        
        # Verify participant has joined
        contriboost_contract = w3.eth.contract(address=contract_address, abi=CONTRIBOOST_ABI)
        participant_status = contriboost_contract.functions.getParticipantStatus(address).call()
        if not participant_status[3]:  # Check 'exists' field
            raise HTTPException(status_code=403, detail="Not a Contriboost participant")
        return address
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verification failed: {str(e)}")

# WebSocket clients
connected_clients: dict[str, list[WebSocket]] = {}

@app.on_event("startup")
async def startup():
    await init_db()

@app.on_event("shutdown")
async def shutdown():
    await close_db()

@app.websocket("/ws/chat/{contract_address}")
async def websocket_endpoint(websocket: WebSocket, contract_address: str, address: str = Depends(verify_participant)):
    await websocket.accept()
    if contract_address not in connected_clients:
        connected_clients[contract_address] = []
    connected_clients[contract_address].append(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action", "send")
            if action == "send":
                message = Message(sender=address, contract_address=contract_address, content=data["content"])
                async with db_pool.acquire() as conn:
                    message_id = await conn.fetchval(
                        "INSERT INTO messages (sender, contract_address, content, timestamp) VALUES ($1, $2, $3, $4) RETURNING id",
                        message.sender, message.contract_address, message.content, int(time.time())
                    )
                for client_ws in connected_clients.get(contract_address, []):
                    await client_ws.send_json({
                        "id": message_id,
                        "sender": message.sender,
                        "content": message.content,
                        "timestamp": int(time.time()),
                        "edited": False,
                        "action": "send"
                    })
            elif action == "edit":
                await handle_edit_message(data, address, contract_address)
            elif action == "delete":
                await handle_delete_message(data, address, contract_address)
    except Exception as e:
        print(f"Error: {str(e)}")
    finally:
        connected_clients[contract_address].remove(websocket)
        if not connected_clients[contract_address]:
            del connected_clients[contract_address]
        await websocket.close()

async def handle_edit_message(data, address, contract_address):
    message_id = data.get("message_id")
    new_content = data.get("content")
    async with db_pool.acquire() as conn:
        message = await conn.fetchrow(
            "SELECT sender, timestamp FROM messages WHERE id = $1 AND contract_address = $2",
            message_id, contract_address
        )
        if not message:
            return
        if message["sender"].lower() != address.lower():
            return
        if message["timestamp"] < int(time.time()) - 300:  # 5-minute edit window
            return
        await conn.execute(
            "UPDATE messages SET content = $1, edited = TRUE WHERE id = $2",
            new_content, message_id
        )
        for client_ws in connected_clients.get(contract_address, []):
            await client_ws.send_json({
                "id": message_id,
                "sender": address,
                "content": new_content,
                "timestamp": message["timestamp"],
                "edited": True,
                "action": "edit"
            })

async def handle_delete_message(data, address, contract_address):
    message_id = data.get("message_id")
    async with db_pool.acquire() as conn:
        message = await conn.fetchrow(
            "SELECT sender FROM messages WHERE id = $1 AND contract_address = $2",
            message_id, contract_address
        )
        if not message:
            return
        if message["sender"].lower() != address.lower():
            return
        await conn.execute("DELETE FROM messages WHERE id = $1", message_id)
        for client_ws in connected_clients.get(contract_address, []):
            await client_ws.send_json({
                "id": message_id,
                "action": "delete"
            })

@app.get("/chat/history/{contract_address}")
async def get_chat_history(contract_address: str, address: str = Depends(verify_participant)):
    async with db_pool.acquire() as conn:
        messages = await conn.fetch(
            "SELECT id, sender, content, timestamp, edited FROM messages WHERE contract_address = $1 ORDER BY timestamp",
            contract_address
        )
    return {
        "contract_address": contract_address,
        "messages": [{"id": m["id"], "sender": m["sender"], "content": m["content"], "timestamp": m["timestamp"], "edited": m["edited"]} for m in messages]
    }

@app.post("/chat/edit/{contract_address}")
async def edit_message(edit: EditMessage, contract_address: str, address: str = Depends(verify_participant)):
    async with db_pool.acquire() as conn:
        message = await conn.fetchrow(
            "SELECT sender, timestamp FROM messages WHERE id = $1 AND contract_address = $2",
            edit.message_id, contract_address
        )
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        if message["sender"].lower() != address.lower():
            raise HTTPException(status_code=403, detail="Not authorized to edit")
        if message["timestamp"] < int(time.time()) - 300:
            raise HTTPException(status_code=403, detail="Edit window expired")
        await conn.execute(
            "UPDATE messages SET content = $1, edited = TRUE WHERE id = $2",
            edit.content, edit.message_id
        )
    return {"status": "success"}

@app.delete("/chat/delete/{contract_address}/{message_id}")
async def delete_message(message_id: int, contract_address: str, address: str = Depends(verify_participant)):
    async with db_pool.acquire() as conn:
        message = await conn.fetchrow(
            "SELECT sender FROM messages WHERE id = $1 AND contract_address = $2",
            message_id, contract_address
        )
        if not message:
            raise HTTPException(status_code=404, detail="Message not found")
        if message["sender"].lower() != address.lower():
            raise HTTPException(status_code=403, detail="Not authorized to delete")
        await conn.execute("DELETE FROM messages WHERE id = $1", message_id)
    return {"status": "success"}