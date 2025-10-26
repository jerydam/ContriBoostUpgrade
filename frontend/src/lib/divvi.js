import { getReferralTag, submitReferral } from '@divvi/referral-sdk';

// Your Divvi Identifier
const DIVVI_CONSUMER_ADDRESS = '0xdA404bFDA2a5dCDa88FD2aa9B9e0C32a677bc8eB';

/**
 * Generates a Divvi referral tag for a user's transaction
 * @param {string} userAddress - The user's wallet address
 * @returns {string} The referral tag to append to transaction data
 */
export function generateDivviTag(userAddress) {
  return getReferralTag({
    user: userAddress,
    consumer: DIVVI_CONSUMER_ADDRESS,
  });
}

/**
 * Submits a transaction to Divvi for referral tracking
 * @param {string} txHash - The transaction hash
 * @param {number} chainId - The chain ID where the transaction was sent
 * @returns {Promise<void>}
 */
export async function submitDivviReferral(txHash, chainId) {
  try {
    await submitReferral({
      txHash,
      chainId,
    });
    console.log('✅ Divvi referral submitted successfully:', txHash);
  } catch (error) {
    // Log error but don't throw - we don't want to break the user experience if Divvi tracking fails
    console.error('❌ Failed to submit Divvi referral:', error);
  }
}

/**
 * Helper to append Divvi referral tag to transaction data
 * @param {string} originalData - The original transaction data
 * @param {string} referralTag - The Divvi referral tag
 * @returns {string} The combined data with referral tag
 */
export function appendReferralTag(originalData, referralTag) {
  // Ensure data starts with 0x
  const cleanData = originalData.startsWith('0x') ? originalData : `0x${originalData}`;
  
  // Remove 0x from referral tag if present
  const cleanTag = referralTag.startsWith('0x') ? referralTag.slice(2) : referralTag;
  
  return cleanData + cleanTag;
}