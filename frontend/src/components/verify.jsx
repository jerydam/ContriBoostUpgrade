// ============================================================================
// FILE: src/components/self-verification-flow.jsx
// SELF PROTOCOL - VERIFICATION FLOW COMPONENT
// ============================================================================

"use client";

import { useState, useEffect } from "react";
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Smartphone, QrCode, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SelfQRcodeWrapper, SelfAppBuilder, getUniversalLink } from "@selfxyz/qrcode";
import { toast } from "react-toastify";

// ============================================================================
// CONFIGURATION
// ============================================================================

const SELF_CONFIG = {
  scope: process.env.NEXT_PUBLIC_SELF_SCOPE || "contriboost",
  endpoint:
    process.env.NEXT_PUBLIC_SELF_ENDPOINT || "https://www.contriboost.xyz/api/verify",
  mode: process.env.NEXT_PUBLIC_SELF_MODE || "mainnet",
  appName: process.env.NEXT_PUBLIC_SELF_APP_NAME || "Contriboost",
  minimumAge: parseInt(process.env.NEXT_PUBLIC_MINIMUM_AGE || "15"),
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || "https://www.contriboost.xyz/logo.png",
};

const BUTTON_STYLE_CLASSES =
  "border-2 border-amber-50 transition-all hover:scale-[1.02] active:scale-[0.98]";

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
    const app = new SelfAppBuilder({
      version: 2,
      appName: SELF_CONFIG.appName,
      scope: SELF_CONFIG.scope,
      endpoint: SELF_CONFIG.endpoint,
      logoBase64: SELF_CONFIG.logoUrl,
      userId: userAddress || "0x0",
      endpointType: SELF_CONFIG.mode === "mainnet" ? "mainnet" : "staging_celo",
      userIdType: "hex",
      userDefinedData: userAddress || "",
      disclosures: {
        minimumAge: SELF_CONFIG.minimumAge,
        excludedCountries: ["KP", "IR", "SY", "CU"],
        ofac: true,
        nationality: true,
      },
    }).build();

    console.log("✓ Self app built successfully");
    return app;
  } catch (error) {
    console.error("❌ Failed to build Self app:", error);
    throw error;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * SelfVerificationFlow Component
 * 
 * Displays QR code for desktop or deep link button for mobile.
 * Handles identity verification via Self Protocol.
 * 
 * Props:
 * - onSuccess: Callback when verification succeeds
 * - onCancel: Callback when user cancels
 * - isFlowOpen: Boolean to show/hide the flow
 * - userAddress: User's wallet address (optional)
 */
export default function SelfVerificationFlow({
  onSuccess,
  onCancel,
  isFlowOpen,
  userAddress,
}) {
  const isMobile = useIsMobile();
  const [selfApp, setSelfApp] = useState(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [universalLink, setUniversalLink] = useState("");
  const [error, setError] = useState(null);

  // ========================================================================
  // INITIALIZE SELF APP
  // ========================================================================

  useEffect(() => {
    if (!isFlowOpen) return;

    const initializeApp = async () => {
      try {
        setIsAppLoading(true);
        setError(null);
        console.log("🚀 Initializing Self verification flow...");

        // Build Self app with user address
        const app = buildSelfApp(userAddress);
        setSelfApp(app);

        // Generate universal link for mobile
        try {
          const link = getUniversalLink(app);
          setUniversalLink(link);
          console.log("✓ Universal link generated");
        } catch (linkError) {
          console.warn("Warning: Failed to generate universal link:", linkError);
          // Don't fail completely, QR code will still work on desktop
        }

        console.log("✓ Verification flow ready");
      } catch (err) {
        console.error("❌ Initialization error:", err);
        setError(err.message || "Failed to initialize verification");
        toast.error("Failed to initialize verification");
      } finally {
        setIsAppLoading(false);
      }
    };

    initializeApp();
  }, [isFlowOpen, userAddress]);

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
          userContextData: userAddress || "0x0",
        }),
      });

      const result = await response.json();

      console.log("Backend Response:", result);

      if (result.status === "success" && result.result === true) {
        console.log("✅ Identity verified successfully!");
        toast.success("Identity verified successfully!");

        // Call parent callback with verified user data
        if (onSuccess) {
          onSuccess(result.user);
        }
      } else {
        const reason = result.reason || "Verification failed";
        console.warn(`❌ Verification failed: ${reason}`);
        toast.error(reason);
      }
    } catch (error) {
      console.error("❌ Verification error:", error);
      toast.error("Verification error: " + error.message);
    }
  };

  // ========================================================================
  // HANDLE VERIFICATION ERROR
  // ========================================================================

  const handleVerificationError = (err) => {
    console.error("❌ Verification error:", err);
    const reason = err?.reason || err?.message || "Verification failed";
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
      <Card className="p-6 mt-4 max-w-sm mx-auto flex justify-center items-center h-48 fixed inset-0 z-50 m-auto bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Initializing Verification...</span>
      </Card>
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
          <div className="flex flex-col items-center">
            <QrCode className="h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Scan with your Self mobile app:
            </p>
            <SelfQRcodeWrapper
              selfApp={selfApp}
              onSuccess={handleVerificationSuccess}
              onError={handleVerificationError}
              size={256}
            />
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
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-900 z-10 p-2 rounded-full hover:bg-gray-100 transition-colors"
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
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : selfApp ? (
          <VerificationContent />
        ) : (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Verification initialization failed.
            </AlertDescription>
          </Alert>
        )}
      </Card>
    </div>
  );
}