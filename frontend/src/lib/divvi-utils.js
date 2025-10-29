/**
 * Divvi Integration Utility
 * Handles referral tracking for state-changing transactions
 */

import { getReferralTag, submitReferral } from '@divvi/referral-sdk';

// Your Divvi Identifier
const DIVVI_CONSUMER = '0xdA404bFDA2a5dCDa88FD2aa9B9e0C32a677bc8eB';

/**
 * Generate a referral tag for a user
 * @param {string} userAddress - The user's wallet address
 * @returns {string} The referral tag to append to transaction data
 */
export function getDivviReferralTag(userAddress) {
  if (!userAddress) {
    console.warn('No user address provided for Divvi referral tag');
    return '';
  }

  try {
    const referralTag = getReferralTag({
      user: userAddress,
      consumer: DIVVI_CONSUMER,
    });
    return referralTag;
  } catch (error) {
    console.error('Error generating Divvi referral tag:', error);
    return '';
  }
}

/**
 * Append referral tag to transaction data
 * @param {string} data - Original transaction data
 * @param {string} userAddress - The user's wallet address
 * @returns {string} Transaction data with appended referral tag
 */
export function appendDivviTag(data, userAddress) {
  const referralTag = getDivviReferralTag(userAddress);
  if (!referralTag) return data;
  
  // If data is null or undefined, start with '0x'
  const baseData = data || '0x';
  return baseData + referralTag.replace('0x', '');
}

/**
 * Submit a referral to Divvi after transaction confirmation
 * @param {string} txHash - The transaction hash
 * @param {number} chainId - The chain ID where the transaction was sent
 * @returns {Promise<void>}
 */
export async function submitDivviReferral(txHash, chainId) {
  if (!txHash || !chainId) {
    console.warn('Missing txHash or chainId for Divvi referral submission');
    return;
  }

  try {
    await submitReferral({
      txHash,
      chainId,
    });
    console.log('Divvi referral submitted successfully:', txHash);
  } catch (error) {
    console.error('Error submitting Divvi referral:', error);
    // Don't throw - we don't want to break the user flow if Divvi submission fails
  }
}

/**
 * Wrapper for ethers.js contract transactions that includes Divvi tracking
 * This modifies the transaction to include the referral tag in the data field
 * @param {Object} contract - The ethers.js contract instance
 * @param {string} methodName - The contract method name to call
 * @param {Array} args - Arguments for the contract method
 * @param {Object} txOptions - Transaction options (gasLimit, value, etc.)
 * @param {string} userAddress - The user's wallet address
 * @param {number} chainId - The chain ID
 * @returns {Promise<Object>} Transaction receipt
 */
export async function executeContractWithDivvi(
  contract,
  methodName,
  args,
  txOptions,
  userAddress,
  chainId
) {
  try {
    // Get the populated transaction to extract the data field
    const populatedTx = await contract[methodName].populateTransaction(...args);
    
    // Append referral tag to the transaction data
    const dataWithTag = appendDivviTag(populatedTx.data, userAddress);
    
    // Execute the transaction with modified data
    const tx = await contract[methodName](...args, {
      ...txOptions,
      data: dataWithTag,
    });
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    // Submit referral to Divvi
    await submitDivviReferral(receipt.hash || tx.hash, chainId);
    
    return receipt;
  } catch (error) {
    console.error('Error executing contract with Divvi tracking:', error);
    throw error;
  }
}

/**
 * Simple wrapper to add Divvi tracking to an already-sent transaction
 * Use this when you need to handle the transaction yourself but still want Divvi tracking
 * @param {Object} tx - The transaction object (with hash)
 * @param {number} chainId - The chain ID
 * @returns {Promise<Object>} Transaction receipt
 */
export async function trackTransactionWithDivvi(tx, chainId) {
  const receipt = await tx.wait();
  await submitDivviReferral(receipt.hash || tx.hash, chainId);
  return receipt;
}