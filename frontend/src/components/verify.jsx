"use client";

import { useState, useEffect } from "react";
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertCircle,
  Smartphone,
  QrCode,
  X,
  CheckCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SelfQRcodeWrapper, SelfAppBuilder, getUniversalLink } from "@selfxyz/qrcode";
import { toast } from "react-toastify";

// ============================================================================
// CONFIGURATION - FRONTEND
// ============================================================================

const SELF_CONFIG = {
  scope: "contriboost",
  endpoint: "https://www.contriboost.xyz/api/verify",
  mode: "celo", 
  appName: "Contriboost App",
  minimumAge: parseInt("15"),
  logoUrl: "https://i.postimg.cc/mrmVf9hm/self.png",
};

console.log("🔐 Frontend Configuration:");
console.log(`   Scope: ${SELF_CONFIG.scope}`);
console.log(`   Endpoint: ${SELF_CONFIG.endpoint}`);
console.log(`   Mode: ${SELF_CONFIG.mode}`);
console.log(`   Minimum Age: ${SELF_CONFIG.minimumAge}`);

const BUTTON_STYLE_CLASSES =
  "transition-all hover:scale-[1.02] active:scale-[0.98]";

// ============================================================================
// CUSTOM HOOK: DETECT MOBILE
// ============================================================================

const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, [breakpoint]);

  return isMobile;
};

// ============================================================================
// BUILD SELF APP
// ============================================================================

function buildSelfApp(userAddress) {
  try {
    console.log("🚀 Building Self app...");
    console.log(`   Using connected address: ${userAddress}`);

    if (!userAddress || userAddress === "0x0") {
      throw new Error("Valid user address is required for verification");
    }

    const hexAddress = userAddress.startsWith("0x") 
      ? userAddress 
      : `0x${userAddress}`;

    console.log(`   Hex address: ${hexAddress}`);

    const app = new SelfAppBuilder({
      version: 2,
      appName: SELF_CONFIG.appName,
      scope: SELF_CONFIG.scope,
      endpoint: SELF_CONFIG.endpoint,
      logoBase64: SELF_CONFIG.logoUrl,
      userId: hexAddress,
      endpointType: SELF_CONFIG.mode === "celo",
      userIdType: "hex",
      userDefinedData: userAddress, 

      disclosures: {
        minimumAge: SELF_CONFIG.minimumAge,
        excludedCountries: [],
        ofac: false,
        nationality: true,
      },
    }).build();

    console.log("✓ Self app built successfully");
    console.log(`   App Config:`, {
      scope: SELF_CONFIG.scope,
      appName: SELF_CONFIG.appName,
      userId: hexAddress,
      endpointType: SELF_CONFIG.mode === "mainnet",
    });
    
    return app;
  } catch (error) {
    console.error("❌ Failed to build Self app:", error);
    throw error;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SelfVerificationFlow({
  selfApp: externalSelfApp,
  onSuccess,
  onCancel,
  isFlowOpen,
  isAppLoading: externalIsAppLoading,
  userAddress, // Connected wallet address
}) {
  const isMobile = useIsMobile();
  
  // ✅ DEBUG: Log props on mount and when they change
  useEffect(() => {
    console.log("🔍 SelfVerificationFlow Props:", {
      isFlowOpen,
      userAddress,
      hasOnSuccess: !!onSuccess,
      hasOnCancel: !!onCancel,
      externalSelfApp: !!externalSelfApp,
    });
  }, [isFlowOpen, userAddress, onSuccess, onCancel, externalSelfApp]);

  // Internal state management
  const [selfApp, setSelfApp] = useState(externalSelfApp || null);
  const [isAppLoading, setIsAppLoading] = useState(externalIsAppLoading ?? false);
  const [universalLink, setUniversalLink] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("pending");
  const [errorMessage, setErrorMessage] = useState("");

  // ========================================================================
  // BUILD SELF APP IF NOT PROVIDED
  // ========================================================================

  useEffect(() => {
    if (!isFlowOpen) {
      console.log("⏸️ Flow is closed, skipping initialization");
      return;
    }

    console.log("🎯 Flow opened, checking userAddress...");
    console.log(`   userAddress value: "${userAddress}"`);
    console.log(`   userAddress type: ${typeof userAddress}`);

    // Validate userAddress
    if (!userAddress || userAddress === "0x0") {
      console.error("❌ Invalid userAddress:", userAddress);
      setErrorMessage("Connected wallet address is required");
      setVerificationStatus("error");
      return;
    }

    console.log("✅ userAddress is valid, proceeding...");

    // If selfApp not provided externally, build it
    if (!externalSelfApp) {
      const initializeApp = async () => {
        try {
          setIsAppLoading(true);
          setErrorMessage("");
          console.log("🚀 Initializing Self verification flow...");
          console.log(`📋 User Address: ${userAddress}`);

          const app = buildSelfApp(userAddress); // ✅ Pass connected address
          console.log("✓ App object created:", app);
          
          setSelfApp(app);

          // Generate universal link
          try {
            const link = getUniversalLink(app);
            setUniversalLink(link);
            console.log("✓ Universal link generated:", link);
          } catch (linkError) {
            console.warn("⚠️ Warning: Failed to generate universal link:", linkError);
            // Don't fail - QR code should still work even if universal link fails
          }

          console.log("✓ Verification flow ready");
          setVerificationStatus("pending");
        } catch (error) {
          console.error("❌ Initialization error:", error);
          setErrorMessage(error.message || "Failed to initialize verification");
          setVerificationStatus("error");
          toast.error("Failed to initialize verification");
        } finally {
          setIsAppLoading(false);
        }
      };

      initializeApp();
    } else {
      // Use externally provided selfApp
      console.log("✓ Using external selfApp");
      setSelfApp(externalSelfApp);
      setIsAppLoading(externalIsAppLoading ?? false);

      // Generate universal link from external app
      if (externalSelfApp) {
        try {
          const link = getUniversalLink(externalSelfApp);
          setUniversalLink(link);
          console.log("✓ Universal link from external app:", link);
        } catch (e) {
          console.warn("⚠️ Warning: Failed to generate universal link:", e);
        }
      }
    }
  }, [isFlowOpen, externalSelfApp, externalIsAppLoading, userAddress]);

  // ========================================================================
  // HANDLE OPEN SELF APP (MOBILE)
  // ========================================================================

  const handleOpenSelfApp = () => {
    if (!universalLink) {
      toast.error("Verification link not ready");
      return;
    }

    console.log("📱 Opening Self app...");
    window.open(universalLink, "_blank");
  };

  // ========================================================================
  // HANDLE VERIFICATION SUCCESS
  // ========================================================================

  const handleVerificationSuccess = async (proofData) => {
    console.log("✅ Proof received from Self app");
    setVerificationStatus("loading");

    try {
      // Extract proof components
      const { attestationId, proof, publicSignals } = proofData;

      console.log("📤 Sending proof to backend for verification...");

      // Call backend verification endpoint
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attestationId,
          proof,
          publicSignals,
          userContextData: userAddress, // ✅ Use connected address
        }),
      });

      const result = await response.json();

      console.log("Backend Response:", result);

      if (result.status === "success" && result.result === true) {
        console.log("✅ Identity verified successfully!");
        setVerificationStatus("success");
        toast.success("Identity verified successfully!");

        // Call parent callback with verified user data
        if (onSuccess) {
          onSuccess(result.user);
        }
      } else {
        const reason = result.reason || "Verification failed";
        console.warn(`❌ Verification failed: ${reason}`);
        setVerificationStatus("error");
        setErrorMessage(reason);
        toast.error(reason);
      }
    } catch (error) {
      console.error("❌ Verification error:", error);
      setVerificationStatus("error");
      setErrorMessage(error.message || "Verification failed");
      toast.error("Verification error: " + error.message);
    }
  };

  // ========================================================================
  // HANDLE VERIFICATION ERROR
  // ========================================================================

  const handleVerificationError = (err) => {
    console.error("❌ Verification error:", err);
    const reason = err?.reason || err?.message || "Verification failed";
    setErrorMessage(reason);
    setVerificationStatus("error");
    toast.error(reason);
  };

  // ========================================================================
  // RENDER: CLOSED STATE
  // ========================================================================

  if (!isFlowOpen) return null;

  // ========================================================================
  // RENDER: LOADING STATE
  // ========================================================================

  if (isAppLoading) {
    return (
      <Card className="p-6 mt-4 max-w-sm mx-auto flex justify-center items-center h-48 fixed inset-0 z-50 m-auto">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Initializing Verification...</span>
      </Card>
    );
  }

  // ========================================================================
  // RENDER: SUCCESS STATE
  // ========================================================================

  if (verificationStatus === "success") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <Card className="p-8 max-w-sm mx-auto w-full">
          <div className="flex flex-col items-center text-center">
            <CheckCircle className="h-16 w-16 text-primary mb-4" />
            <CardTitle className="text-2xl mb-2">Verified!</CardTitle>
            <CardDescription className="mb-6">
              Your identity has been verified successfully.
            </CardDescription>
            <Button onClick={onCancel} variant="default" className="w-full">
              Continue
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ========================================================================
  // RENDER: ERROR STATE
  // ========================================================================

  if (verificationStatus === "error") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <Card className="p-6 max-w-sm mx-auto w-full">
          <div className="flex flex-col items-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-3" />
            <CardTitle className="mb-3">Verification Failed</CardTitle>
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
            <div className="flex gap-3 w-full">
              <Button
                onClick={() => {
                  setVerificationStatus("pending");
                  setErrorMessage("");
                }}
                variant="default"
                className="flex-1"
              >
                Retry
              </Button>
              <Button
                onClick={onCancel}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ========================================================================
  // RENDER: VERIFICATION CONTENT
  // ========================================================================

  const VerificationContent = () => (
    <CardContent className="p-0">
      <div className="flex flex-col items-center space-y-4">
        {isMobile ? (
          // ================================================================
          // MOBILE VIEW: Deep Link Button
          // ================================================================
          <div className="flex flex-col items-center space-y-3 w-full">
            <Smartphone className="h-10 w-10 text-primary mb-2" />
            <Button
              onClick={handleOpenSelfApp}
              disabled={!universalLink}
              className={`min-w-[120px] ${BUTTON_STYLE_CLASSES}`}
            >
              Open Self App to Verify
            </Button>
            <p className="text-sm text-muted-foreground pt-2">
              *This will open the Self app directly.*
            </p>
          </div>
        ) : (
          // ================================================================
          // DESKTOP VIEW: QR Code
          // ================================================================
          <div className="flex flex-col items-center w-full">
            <QrCode className="h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-4">
              Scan with your Self mobile app:
            </p>
            
            {selfApp ? (
              <div className="border-2 border-border rounded-lg p-4 bg-white">
                <SelfQRcodeWrapper
                  selfApp={selfApp}
                  onSuccess={handleVerificationSuccess}
                  onError={handleVerificationError}
                  size={256}
                />
              </div>
            ) : (
              <Alert variant="destructive" className="w-full">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Failed to generate QR code. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Button
          variant="outline"
          onClick={onCancel}
          className={BUTTON_STYLE_CLASSES}
        >
          Cancel
        </Button>
      </div>
    </CardContent>
  );

  // ========================================================================
  // RENDER: MAIN MODAL
  // ========================================================================

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="p-6 mt-4 max-w-sm mx-auto relative w-full">
        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground z-10 p-2 rounded-full hover:bg-accent transition-colors"
          aria-label="Close verification"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Header */}
        <CardTitle className="mb-2 text-xl">Identity Verification</CardTitle>
        <CardDescription className="mb-4">
          Prove your identity to join the Contriboost Circle.
        </CardDescription>

        {/* Content or Error */}
        {errorMessage && verificationStatus !== "pending" ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : selfApp ? (
          <VerificationContent />
        ) : (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Verification initialization failed.</AlertDescription>
          </Alert>
        )}
      </Card>
    </div>
  );
}