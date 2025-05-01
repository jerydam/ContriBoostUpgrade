import { MongoClient, ServerApiVersion } from "mongodb";
import { NextResponse } from "next/server";

export async function POST(request) {
  // Skip database operations during build
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ message: "Skipped during build" }, { status: 200 });
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not defined");
    return NextResponse.json(
      { message: "Server configuration error: Missing MONGODB_URI" },
      { status: 500 }
    );
  }

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  try {
    // Parse request body safely
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error("Error parsing request body:", error);
      return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }

    const { email } = body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: "Invalid email address" }, { status: 400 });
    }

    await client.connect();
    const database = client.db("subscriptions");
    const collection = database.collection("emails");

    const existingEmail = await collection.findOne({ email });
    if (existingEmail) {
      toast.warning({ message: "Email already subscribed" })
      return NextResponse.json({ message: "Email already subscribed" }, { status: 400 });
      
    }

    await collection.insertOne({ email, subscribedAt: new Date() });
    toast.success({ message: "Subscription successful" });
    return NextResponse.json({ message: "Subscription successful" }, { status: 200 });
  } catch (error) {
    console.error("Error subscribing:", error);
    toast.error("Error subscribing:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  } finally {
    await client.close();
  }
}