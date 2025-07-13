"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { SelfQRcodeWrapper, SelfAppBuilder } from "@selfxyz/qrcode";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useWeb3 } from "@/components/providers/web3-provider";

export default function VerificationPage() {
  const { account } = useWeb3();
  const [userId, setUserId] = useState(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkVerification() {
      if (account) {
        setUserId(account);
        try {
          const response = await fetch(`/api/verify/status/${account}`);
          const data = await response.json();
          setIsVerified(data.verified);
          if (data.verified) {
            localStorage.setItem(`verification_${account}`, "true");
          } else {
            localStorage.removeItem(`verification_${account}`);
          }
        } catch (error) {
          console.error("Error checking verification status:", error);
          setIsVerified(false);
          localStorage.removeItem(`verification_${account}`);
        }
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    }
    checkVerification();
  }, [account]);

  const selfApp = new SelfAppBuilder({
    appName: "Contriboost",
    scope: "contriboost",
    endpoint: process.env.NEXT_PUBLIC_VERIFY_ENDPOINT,
    logoBase64: "https://contriboost.vercel.app/contriboostb.png",
    userId: uuidv4(),
    disclosures: {
      minimumAge: 15,
      excludedCountries: ["", ""],
      ofac: true,
      nationality: true,
      name: true,
      dateOfBirth: true,
    },
  }).build();

  const handleVerificationSuccess = async () => {
    try {
      const response = await fetch(`/api/verify/status/${userId}`);
      const data = await response.json();
      if (data.verified) {
        localStorage.setItem(`verification_${userId}`, "true");
        setIsVerified(true);
      }
    } catch (error) {
      console.error("Error confirming verification:", error);
    }
  };

  const handleVerificationError = (error) => {
    console.error(`Verification error: ${error.error_code || "Unknown"} - ${error.reason || "Unknown error"}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">Identity Verification</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {isVerified ? (
            <div className="space-y-4">
              <p className="text-sm md:text-base text-green-600">
                Your identity has been verified successfully!
              </p>
              <Button asChild>
                <Link href="/account">Go to Account</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm md:text-base">
                Scan the QR code below with the Self app to verify your identity.
                Verification is required to create or join Contriboost pools.
              </p>
              <div className="flex justify-center">
                <SelfQRcodeWrapper
                  selfApp={selfApp}
                  onSuccess={handleVerificationSuccess}
                  onError={handleVerificationError}
                  size={350}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}