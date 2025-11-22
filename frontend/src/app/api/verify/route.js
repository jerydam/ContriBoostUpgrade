// ============================================================================
// FILE: app/api/verify/route.ts
// SELF PROTOCOL - FIXED BACKEND VERIFICATION
// ============================================================================

import { NextResponse } from "next/server";
import {
  SelfBackendVerifier,
  DefaultConfigStore,
  AttestationId,
} from "@selfxyz/core";

// ============================================================================
// CONFIGURATION - CORRECTED
// ============================================================================

// ✅ FIX: Use environment variables for flexibility
const SELF_SCOPE = process.env.SELF_SCOPE || "contriboost";
const SELF_ENDPOINT =
  process.env.SELF_ENDPOINT ||
  "https://www.contriboost.xyz/api/verify"; // ✅ FIXED: Added missing slash (https://)
const MINIMUM_AGE = parseInt(process.env.MINIMUM_AGE || "15");
const EXCLUDED_COUNTRIES = (process.env.EXCLUDED_COUNTRIES || "").split(",").filter(Boolean);
const OFAC_CHECK = process.env.OFAC_CHECK === "true";

// ✅ FIX: Set devMode based on environment
// For production: NODE_ENV=production (devMode = false = mainnet)
// For staging: NODE_ENV=development (devMode = true = testnet)
const DEV_MODE = process.env.NODE_ENV !== "production";

console.log("🔐 Backend Configuration:");
console.log(`   Scope: ${SELF_SCOPE}`);
console.log(`   Endpoint: ${SELF_ENDPOINT}`);
console.log(`   Dev Mode: ${DEV_MODE}`);
console.log(`   Minimum Age: ${MINIMUM_AGE}`);
console.log(`   OFAC Check: ${OFAC_CHECK}`);

// ============================================================================
// SINGLETON VERIFIER
// ============================================================================

let verifierInstance = null;

function getVerifier() {
  if (!verifierInstance) {
    const EnabledIds = [
      AttestationId.MINIMUM_AGE,
      AttestationId.NATIONALITY,
      AttestationId.OFAC,
    ];

    console.log(`🔐 Initializing SelfBackendVerifier...`);

    verifierInstance = new SelfBackendVerifier(
      SELF_SCOPE,
      SELF_ENDPOINT,
      DEV_MODE, // ✅ FIX: Matches frontend mode
      EnabledIds,
      new DefaultConfigStore({
        minimumAge: MINIMUM_AGE,
        excludedCountries: EXCLUDED_COUNTRIES,
        ofac: OFAC_CHECK,
      }),
      "hex"
    );

    console.log("✓ SelfBackendVerifier initialized");
  }
  return verifierInstance;
}

// ============================================================================
// VERIFICATION HANDLER
// ============================================================================

export async function POST(req) {
  const startTime = Date.now();

  try {
    console.log("📥 Verification request received");

    // Parse request
    const { attestationId, proof, publicSignals, userContextData } =
      await req.json();

    console.log(`   Attestation ID: ${attestationId}`);
    console.log(`   User Context: ${userContextData?.substring(0, 20)}...`);

    // Validate required fields
    if (!proof || !publicSignals || !attestationId || !userContextData) {
      console.warn("⚠️ Missing required proof inputs");
      return NextResponse.json(
        {
          status: "error",
          message: "Missing required proof inputs.",
          code: "INVALID_INPUT",
        },
        { status: 200 }
      );
    }

    // Get verifier instance
    const verifier = getVerifier();

    // Verify proof
    console.log("🔍 Verifying proof against Identity Verification Hub...");
    const result = await verifier.verify(
      attestationId,
      proof,
      publicSignals,
      userContextData
    );

    console.log("📊 Verification Details:", {
      isValid: result.isValidDetails.isValid,
      isMinimumAgeValid: result.isValidDetails.isMinimumAgeValid,
      isOfacValid: result.isValidDetails.isOfacValid,
    });

    // Extract user data
    const { userIdentifier } = result.userData;
    const userAddress = `0x${userIdentifier.substring(userIdentifier.length - 40)}`;

    console.log(`👤 User Address: ${userAddress}`);

    // Check verification status
    if (!result.isValidDetails.isValid) {
      console.warn("❌ Proof failed hub verification");
      return NextResponse.json(
        {
          status: "error",
          result: false,
          reason: "Proof failed hub verification",
          code: "PROOF_INVALID",
          details: result.isValidDetails,
        },
        { status: 200 }
      );
    }

    if (!result.isValidDetails.isMinimumAgeValid) {
      console.warn(
        `❌ User does not meet minimum age requirement of ${MINIMUM_AGE}`
      );
      return NextResponse.json(
        {
          status: "error",
          result: false,
          reason: `Did not meet age requirement (${MINIMUM_AGE}+)`,
          code: "AGE_REQUIREMENT_FAILED",
          details: result.isValidDetails,
        },
        { status: 200 }
      );
    }

    // Check OFAC if enabled
    if (OFAC_CHECK && result.isValidDetails.isOfacValid === false) {
      console.warn("❌ User failed OFAC screening");
      return NextResponse.json(
        {
          status: "error",
          result: false,
          reason: "User failed OFAC compliance screening",
          code: "OFAC_BLOCKED",
        },
        { status: 200 }
      );
    }

    // Check country restrictions
    if (EXCLUDED_COUNTRIES.length > 0) {
      const userNationality = result.discloseOutput?.nationality;
      if (userNationality && EXCLUDED_COUNTRIES.includes(userNationality)) {
        console.warn(
          `❌ User from excluded country: ${userNationality}`
        );
        return NextResponse.json(
          {
            status: "error",
            result: false,
            reason: `Access not available from your country`,
            code: "COUNTRY_BLOCKED",
          },
          { status: 200 }
        );
      }
    }

    // ✅ SUCCESS
    const verificationTime = Date.now() - startTime;
    console.log(`✅ Verification successful in ${verificationTime}ms`);
    console.log(`   User: ${userAddress}`);

    return NextResponse.json(
      {
        status: "success",
        result: true,
        message: "Identity verified.",
        user: {
          address: userAddress,
          identifier: userIdentifier,
          verified_at: new Date().toISOString(),
        },
        verification_details: {
          age_verified: result.isValidDetails.isMinimumAgeValid,
          ofac_verified: OFAC_CHECK ? result.isValidDetails.isOfacValid : null,
          nationality: result.discloseOutput?.nationality,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Verification Error:", error);

    return NextResponse.json(
      {
        status: "error",
        result: false,
        reason: error.message || "Unknown server error.",
        code: "SERVER_ERROR",
      },
      { status: 200 }
    );
  }
}