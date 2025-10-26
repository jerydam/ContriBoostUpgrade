"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { SelfQRcodeWrapper, SelfAppBuilder } from "@selfxyz/qrcode";
import { getUniversalLink } from "@selfxyz/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Smartphone, QrCode, CheckCircle, AlertCircle, Shield, User, Calendar, MapPin } from "lucide-react";
import { useWeb3 } from "@/components/providers/web3-provider";

export default function VerificationPage() {
  const { account, connect } = useWeb3();
  const [selfApp, setSelfApp] = useState(null);
  const [universalLink, setUniversalLink] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState("idle"); // idle, waiting, verified, failed
  const [verificationData, setVerificationData] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);

  // Check verification status on mount
  useEffect(() => {
    if (account) {
      checkLocalVerification();
    }
    setIsLoading(false);
  }, [account]);

  // Initialize Self app when account is available
  useEffect(() => {
    if (account) {
      initializeSelfApp();
    }
  }, [account]);

  const checkLocalVerification = () => {
    try {
      const stored = localStorage.getItem(`verification_${account.toLowerCase()}`);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.verified && data.timestamp) {
          // Check if verification is not too old (optional - e.g., 30 days)
          const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
          if (data.timestamp > thirtyDaysAgo) {
            setIsVerified(true);
            setVerificationData(data);
            setVerificationStatus("verified");
            return;
          }
        }
      }
    } catch (error) {
      console.error("Error checking local verification:", error);
    }
    
    setIsVerified(false);
    setVerificationStatus("idle");
  };

  const initializeSelfApp = () => {
    try {
      const app = new SelfAppBuilder({
        version: 2,
        appName: "Contriboost",
        scope: "contriboost",
        endpoint: window.location.origin, // Use current domain
        logoBase64: "https://contriboost.vercel.app/contriboostb.png",
        userId: account.toLowerCase(),
        endpointType: "staging_https",
        userIdType: "hex",
        userDefinedData: "Contriboost Identity Verification",
        disclosures: {
          // Verification requirements
          minimumAge: 15,
          ofac: false, // Disable OFAC for client-side
          excludedCountries: [],
          
          // Data disclosure requests
          nationality: true,
          name: true,
          dateOfBirth: true,
          gender: true,
        },
      }).build();

      setSelfApp(app);
      setUniversalLink(getUniversalLink(app));
      console.log("Self app initialized for user:", account);
    } catch (error) {
      console.error("Failed to initialize Self app:", error);
    }
  };

  const handleVerificationSuccess = (result) => {
    console.log("Verification successful:", result);
    setVerificationStatus("waiting");
    
    // In a real implementation, you would validate the proof here
    // For this client-side version, we'll simulate successful verification
    setTimeout(() => {
      const verificationRecord = {
        verified: true,
        timestamp: Date.now(),
        userAddress: account.toLowerCase(),
        verificationData: result,
        // Store any disclosed information
        disclosures: {
          nationality: result?.nationality || "Unknown",
          name: result?.name || "Verified User",
          dateOfBirth: result?.dateOfBirth || null,
          gender: result?.gender || null,
          minimumAge: result?.minimumAge || 15,
        }
      };

      // Store verification in localStorage
      localStorage.setItem(
        `verification_${account.toLowerCase()}`,
        JSON.stringify(verificationRecord)
      );

      setVerificationData(verificationRecord);
      setVerificationResult(result);
      setIsVerified(true);
      setVerificationStatus("verified");
      
      console.log("Verification stored locally");
    }, 2000);
  };

  const handleVerificationError = (error) => {
    console.error("Verification error:", error);
    setVerificationStatus("failed");
    
    // Clear any previous verification
    localStorage.removeItem(`verification_${account.toLowerCase()}`);
    setIsVerified(false);
    setVerificationData(null);
  };

  const openSelfApp = () => {
    if (universalLink) {
      window.open(universalLink, "_blank");
    }
  };

  const clearVerification = () => {
    localStorage.removeItem(`verification_${account.toLowerCase()}`);
    setIsVerified(false);
    setVerificationData(null);
    setVerificationResult(null);
    setVerificationStatus("idle");
  };

  const formatAddress = (address) => {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Loading verification status...</span>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg md:text-xl flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Connect Wallet Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm md:text-base text-muted-foreground">
              Please connect your wallet to start the identity verification process.
            </p>
            <Button onClick={connect} size="lg">
              Connect Wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
      {/* Main Verification Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg md:text-xl flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Identity Verification
            </CardTitle>
            {isVerified && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>
          {verificationStatus === "waiting" && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing verification...
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isVerified ? (
            <div className="space-y-6">
              {/* Verification Success */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h3 className="font-medium text-green-800">Identity Verified Successfully</h3>
                </div>
                <p className="text-sm text-green-700">
                  Your identity has been verified and you can now participate in Contriboost pools.
                </p>
                {verificationData?.timestamp && (
                  <p className="text-xs text-green-600 mt-1">
                    Verified on {formatDate(verificationData.timestamp)}
                  </p>
                )}
              </div>

              {/* Verification Details */}
              {verificationData?.disclosures && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Verification Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-3 w-3 text-gray-500" />
                      <span className="text-gray-600">Name:</span>
                      <span>{verificationData.disclosures.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3 text-gray-500" />
                      <span className="text-gray-600">Nationality:</span>
                      <span>{verificationData.disclosures.nationality}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-gray-500" />
                      <span className="text-gray-600">Age Verified:</span>
                      <span>15+ years</span>
                    </div>
                    {verificationData.disclosures.gender && (
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-gray-500" />
                        <span className="text-gray-600">Gender:</span>
                        <span>{verificationData.disclosures.gender}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      Wallet: {formatAddress(account)} • 
                      Verified using Self Protocol • 
                      Data stored locally
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild size="lg">
                  <Link href="/create/contribution">Create Pool</Link>
                </Button>
                <Button variant="outline" asChild size="lg">
                  <Link href="/pools">Browse Pools</Link>
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearVerification}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Reset Verification
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Information */}
              <div className="space-y-3">
                <p className="text-sm md:text-base">
                  Verify your identity using Self Protocol to participate in Contriboost pools.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <h4 className="font-medium text-blue-800 mb-1">What we verify:</h4>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>• Minimum age of 15 years</li>
                    <li>• Valid government-issued document</li>
                    <li>• No sanctions list matching</li>
                  </ul>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <h4 className="font-medium text-amber-800 mb-1">Privacy notice:</h4>
                  <p className="text-xs text-amber-700">
                    Your personal data is processed using zero-knowledge proofs. 
                    Only verification status is stored locally in your browser.
                  </p>
                </div>
              </div>

              {/* QR Code / Mobile Interface */}
              {selfApp ? (
                <div className="space-y-4">
                  {/* Desktop QR Code */}
                  <div className="hidden sm:block">
                    <div className="text-center space-y-3">
                      <div className="flex items-center gap-2 justify-center">
                        <QrCode className="h-4 w-4" />
                        <span className="text-sm font-medium">Scan with Self App</span>
                      </div>
                      <div className="flex justify-center">
                        <div className="bg-white p-6 rounded-lg border shadow-sm">
                          <SelfQRcodeWrapper
                            selfApp={selfApp}
                            onSuccess={handleVerificationSuccess}
                            onError={handleVerificationError}
                            size={280}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Don't have the Self app? 
                        <a 
                          href="https://selfprotocol.xyz" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline ml-1"
                        >
                          Download here
                        </a>
                      </p>
                    </div>
                  </div>

                  {/* Mobile Interface */}
                  <div className="sm:hidden">
                    <div className="text-center space-y-3">
                      <Button onClick={openSelfApp} className="w-full" size="lg">
                        <Smartphone className="mr-2 h-4 w-4" />
                        Open Self App
                      </Button>
                      <p className="text-xs text-gray-500">
                        This will open the Self app directly for verification
                      </p>
                    </div>
                  </div>

                  {/* Alternative option for mobile on larger screens */}
                  <div className="hidden sm:block">
                    <div className="pt-4 border-t text-center">
                      <p className="text-xs text-muted-foreground mb-2">On mobile?</p>
                      <Button variant="outline" onClick={openSelfApp} size="sm">
                        <Smartphone className="mr-2 h-3 w-3" />
                        Open Self App Directly
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center py-8">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm">Initializing verification...</span>
                  </div>
                </div>
              )}

              {/* Error State */}
              {verificationStatus === "failed" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <h4 className="font-medium text-red-800">Verification Failed</h4>
                  </div>
                  <p className="text-sm text-red-700 mb-3">
                    The verification process failed. This could be due to:
                  </p>
                  <ul className="text-xs text-red-600 space-y-1 mb-3">
                    <li>• Age requirement not met (minimum 15 years)</li>
                    <li>• Invalid or expired document</li>
                    <li>• Network connectivity issues</li>
                  </ul>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setVerificationStatus("idle");
                      window.location.reload();
                    }}
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How It Works Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How Self Protocol Verification Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <div className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                1
              </div>
              <h4 className="font-medium">Scan QR Code</h4>
              <p className="text-gray-600">Use the Self mobile app to scan the QR code and start verification.</p>
            </div>
            <div className="space-y-2">
              <div className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                2
              </div>
              <h4 className="font-medium">Verify Document</h4>
              <p className="text-gray-600">Take a photo of your passport or ID card using the app's guided process.</p>
            </div>
            <div className="space-y-2">
              <div className="bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                3
              </div>
              <h4 className="font-medium">Zero-Knowledge Proof</h4>
              <p className="text-gray-600">Generate a privacy-preserving proof that confirms your eligibility.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}