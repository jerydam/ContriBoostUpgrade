import { MongoClient, ServerApiVersion } from "mongodb";
import { NextResponse } from "next/server";

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: "Invalid email address" }, { status: 400 });
    }

    await client.connect();
    const database = client.db("subscriptions");
    const collection = database.collection("emails");

    const existingEmail = await collection.findOne({ email });
    if (existingEmail) {
      return NextResponse.json({ message: "Email already subscribed" }, { status: 400 });
    }

    await collection.insertOne({ email, subscribedAt: new Date() });
    return NextResponse.json({ message: "Subscription successful" }, { status: 200 });
  } catch (error) {
    console.error("Error subscribing:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  } finally {
    await client.close();
  }
}