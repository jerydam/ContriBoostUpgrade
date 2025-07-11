from pydantic import BaseModel

class Message(BaseModel):
    sender: str
    contract_address: str
    content: str

class EditMessage(BaseModel):
    message_id: int
    content: str
