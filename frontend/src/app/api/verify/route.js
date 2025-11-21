import { NextResponse } from "next/server";
import { 
    SelfBackendVerifier, 
    AllIds, 
    DefaultConfigStore, 
    UserIdType,
    AttestationId
} from "@selfxyz/core";

// --- SELF CONFIGURATION (Must match frontend hook exactly) ---
const SELF_SCOPE = "contriboost";
const SELF_ENDPOINT = "/api/verify";
const MINIMUM_AGE = 15;
const EXCLUDED_COUNTRIES = []; // Example: ['IRN', 'PRK']
const OFAC_CHECK = false; 
// -----------------------------------------------------------

// Instantiate the verifier once outside the handler
const selfBackendVerifier = new SelfBackendVerifier(
    SELF_SCOPE,
    SELF_ENDPOINT,
    true, // true for mock passports (staging/testnet), false for mainnet
    AllIds,
    new DefaultConfigStore({
        minimumAge: MINIMUM_AGE,
        excludedCountries: EXCLUDED_COUNTRIES,
        ofac: OFAC_CHECK,
    }),
    UserIdType.HEX // Must match frontend's userIdType
);

/**
 * Handles the POST request containing the Zero-Knowledge Proof from the Self relayer.
 */
export async function POST(req) {
    try {
        // 1. Extract data from the request body sent by the Self relayer
        const { attestationId, proof, publicSignals, userContextData } = await req.json();

        if (!proof || !publicSignals || !attestationId || !userContextData) {
            return NextResponse.json(
                { status: "error", message: "Missing required proof inputs." },
                { status: 200 } // Return 200 with error status as per Self SDK conventions
            );
        }

        // 2. Verify the proof against the on-chain hub and our configured rules
        const result = await selfBackendVerifier.verify(
            attestationId,
            proof,
            publicSignals,
            userContextData
        );

        // 3. Check for overall validity and minimum requirements
        if (result.isValidDetails.isValid && result.isValidDetails.isMinimumAgeValid) {
            // Success: Proof is cryptographically valid and meets age/nationality rules
            const { userIdentifier, userDefinedData } = result.userData;
            
            console.log(`Proof validated for user: ${userIdentifier}. Context: ${userDefinedData}`);

            return NextResponse.json({
                status: "success",
                result: true,
                message: "Identity verified.",
                // Optionally return disclosed data if requested
                // disclosedData: result.discloseOutput 
            }, { status: 200 });
        } else {
            // Failure: Proof failed cryptographic or rule checks
            const reason = result.isValidDetails.isMinimumAgeValid ? "Proof failed hub check." : "Did not meet age/rule requirements.";
            
            return NextResponse.json(
                { status: "error", result: false, reason: reason, details: result.isValidDetails },
                { status: 200 }
            );
        }
    } catch (error) {
        console.error("Self Verification API Error:", error);
        if (error.name === 'ConfigMismatchError') {
             return NextResponse.json(
                { status: "error", result: false, reason: "Configuration mismatch. Check backend and frontend rules." },
                { status: 200 }
            );
        }
        return NextResponse.json(
            { status: "error", result: false, reason: error.message || "Unknown server error." },
            { status: 200 }
        );
    }
}