// app/api/webhook/route.js
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();

    // In a production app, you MUST verify the signature here
    // using @farcaster/miniapp-node to ensure the request is real.

    console.log("Farcaster Webhook Received:", body.event);

    if (body.event === "miniapp_added" || body.event === "notifications_enabled") {
      const { notificationDetails } = body;
      const { token, url } = notificationDetails;
      
      // TODO: Save this token + the user's FID to your database.
      // You need this token later to send them push notifications.
      console.log(`Save token for FID ${body.fid}:`, token);
    }

    if (body.event === "notifications_disabled" || body.event === "miniapp_removed") {
      // TODO: Remove the token from your database so you stop sending notifications.
      console.log(`Remove token for FID ${body.fid}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}