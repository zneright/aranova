#![cfg(test)]
<<<<<<< HEAD

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

fn setup_env() -> (Env, AranovaContractClient<'static>, Address, Address, token::Client<'static>, token::StellarAssetClient<'static>) {
    let env = Env::default();
    env.mock_all_auths(); // Bypass strict signature checks for unit testing

    let admin = Address::generate(&env);
    let token_admin = Address::generate(&env);
    
    // Register the smart contract
    let contract_id = env.register_contract(None, AranovaContract);
    let contract = AranovaContractClient::new(&env, &contract_id);
    
    // Register a native-like test token
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token = token::Client::new(&env, &token_id);
    let token_asset = token::StellarAssetClient::new(&env, &token_id);

    contract.initialize(&admin);

    (env, contract, admin, token_id, token, token_asset)
}

#[test]
fn test_initialization_and_pay_receive() {
    let (env, contract, _admin, token_id, token, token_asset) = setup_env();
    
    let commuter = Address::generate(&env);
    let driver = Address::generate(&env);

    // Mint 1000 tokens to the commuter
    token_asset.mint(&commuter, &1000);

    // Commuter pays driver 100 tokens
    contract.process_payment(&commuter, &driver, &token_id, &100);

    // Verify Balances (No vault active yet)
    assert_eq!(token.balance(&commuter), 900);
    assert_eq!(token.balance(&driver), 100);

    // Verify Trust Scores increased by +1
    assert_eq!(contract.get_user_score(&commuter), 701);
    assert_eq!(contract.get_user_score(&driver), 701);
}

#[test]
fn test_vault_auto_save_and_withdraw() {
    let (env, contract, _admin, token_id, token, token_asset) = setup_env();
    
    let commuter = Address::generate(&env);
    let driver = Address::generate(&env);
    token_asset.mint(&commuter, &1000);

    // Driver turns on the vault: 10% auto-save (1000 BPS), 30 day lock
    contract.configure_vault(&driver, &true, &1000, &30);

    // Commuter pays driver 100 tokens
    contract.process_payment(&commuter, &driver, &token_id, &100);

    // Driver should get 90 to wallet, 10 to vault
    assert_eq!(token.balance(&driver), 90);
    
    let vault = contract.get_vault(&driver);
    assert_eq!(vault.balance, 10);
    assert!(vault.unlock_time > env.ledger().timestamp());

    // Advance ledger time by 31 days (31 * 86400 seconds)
    env.ledger().with_mut(|li| li.timestamp += 31 * 86400);

    // Driver withdraws the 10 tokens
    contract.withdraw_from_vault(&driver, &token_id, &10);
    
    // Total wallet balance should now be 100
    assert_eq!(token.balance(&driver), 100);
}

#[test]
#[should_panic(expected = "Vault is still time-locked!")]
fn test_vault_early_withdraw_panics() {
    let (env, contract, _admin, token_id, _, token_asset) = setup_env();
    let driver = Address::generate(&env);
    token_asset.mint(&driver, &1000);

    contract.configure_vault(&driver, &true, &0, &30);
    contract.lock_in_vault(&driver, &token_id, &500);

    // Trying to withdraw immediately should trigger a panic
    contract.withdraw_from_vault(&driver, &token_id, &100);
}

#[test]
fn test_fuel_credit_good_payer() {
    let (env, contract, admin, token_id, token, token_asset) = setup_env();
    
    let coop = Address::generate(&env);
    let driver = Address::generate(&env);
    let pump = Address::generate(&env);

    // Give the Coop and Driver some money
    token_asset.mint(&coop, &5000);
    token_asset.mint(&driver, &1000); // Driver needs money to pay the fee

    // Coop sets limit
    contract.set_driver_limit(&coop, &driver, &1000);

    // Driver requests 1000 XLM for fuel
    contract.issue_fuel_credit(&driver, &coop, &pump, &token_id, &1000);

    // Check pump received funds directly from Coop
    assert_eq!(token.balance(&pump), 1000);
    assert_eq!(token.balance(&coop), 4000);

    // Driver repays immediately (Good Payer)
    contract.repay_fuel_credit(&driver, &token_id);

    // Math Check:
    // Admin gets 0.2% of 1000 = 2
    // Coop gets Principal (1000) + 0.3% (3) = 1003
    assert_eq!(token.balance(&admin), 2);
    assert_eq!(token.balance(&coop), 5003); // Started with 4000 after loan, +1003

    // Trust Score Check (+5 for paying within 24 hours)
    assert_eq!(contract.get_user_score(&driver), 705);
}

#[test]
fn test_fuel_credit_late_payer() {
    let (env, contract, _admin, token_id, _, token_asset) = setup_env();
    
    let coop = Address::generate(&env);
    let driver = Address::generate(&env);
    let pump = Address::generate(&env);

    token_asset.mint(&coop, &5000);
    token_asset.mint(&driver, &2000); 

    contract.set_driver_limit(&coop, &driver, &1000);
    contract.issue_fuel_credit(&driver, &coop, &pump, &token_id, &1000);

    // Advance time past 24 hours (2 days)
    env.ledger().with_mut(|li| li.timestamp += 2 * 86400);

    // Driver repays late
    contract.repay_fuel_credit(&driver, &token_id);

    // Trust Score Check (-20 penalty)
    assert_eq!(contract.get_user_score(&driver), 680);
}

#[test]
#[should_panic(expected = "Requested amount exceeds Trust Score constraints")]
fn test_admin_loan_trust_limit() {
    let (env, contract, admin, token_id, _, token_asset) = setup_env();
    
    let commuter = Address::generate(&env);
    token_asset.mint(&admin, &100000);

    // Commuter starts with 700 score. Max loan = 700 * 2 = 1400.
    // Trying to borrow 5000 should panic.
    contract.issue_admin_loan(&admin, &commuter, &token_id, &5000, &100);
}

#[test]
fn test_admin_loan_success() {
    let (env, contract, admin, token_id, token, token_asset) = setup_env();
    
    let commuter = Address::generate(&env);
    token_asset.mint(&admin, &100000);

    // Commuter starts with 700 score. Max loan = 1400. Borrowing 1000 works.
    contract.issue_admin_loan(&admin, &commuter, &token_id, &1000, &100);

    assert_eq!(token.balance(&commuter), 1000);
=======
use super::{AranovaContract, AranovaContractClient};
use soroban_sdk::{testutils::Address as _, token, Address, Env};

struct TestFixture {
    env: Env,
    client: AranovaContractClient<'static>,
    native_token: token::Client<'static>,
    admin: Address,
    coop: Address,
    driver: Address,
    commuter: Address,
}

fn setup() -> TestFixture {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let coop = Address::generate(&env);
    let driver = Address::generate(&env);
    let commuter = Address::generate(&env);
    
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract(token_admin);
    let native_token = token::Client::new(&env, &token_contract);

    let contract_id = env.register_contract(None, AranovaContract);
    let client = AranovaContractClient::new(&env, &contract_id);

    client.init(&admin);

    TestFixture { env, client, native_token, admin, coop, driver, commuter }
}

#[test]
fn test_universal_payment_and_vault() {
    let fix = setup();
    let token = fix.native_token.address.clone();

    fix.native_token.mint(&fix.commuter, &100_000_000); // 10 XLM
    
    // Driver configures vault to save 10% (1000 bps)
    fix.client.configure_vault(&fix.driver, &true, &1000, &30);

    // Commuter pays Driver 10 XLM
    fix.client.process_payment(&fix.commuter, &fix.driver, &token, &100_000_000);

    // 10% (1 XLM = 10,000,000 stroops) goes to contract vault custody, 9 XLM to driver
    assert_eq!(fix.native_token.balance(&fix.driver), 90_000_000);
    assert_eq!(fix.native_token.balance(&fix.client.address), 10_000_000);
}

#[test]
fn test_fuel_escrow_lifecycle() {
    let fix = setup();
    let token = fix.native_token.address.clone();

    fix.native_token.mint(&fix.coop, &100_000_000); // 10 XLM
    fix.native_token.mint(&fix.driver, &5_000_000); // Extra for fees

    // 1. Coop Deposits 5 XLM
    fix.client.deposit_pool(&fix.coop, &token, &50_000_000);
    assert_eq!(fix.native_token.balance(&fix.client.address), 50_000_000);

    // 2. Release 3 XLM to Driver
    fix.client.release_credit(&fix.coop, &fix.driver, &token, &30_000_000);
    assert_eq!(fix.native_token.balance(&fix.driver), 35_000_000); // Received 3 + initial 0.5
    assert_eq!(fix.native_token.balance(&fix.client.address), 20_000_000); // 2 XLM left in pool

    // 3. Driver Repays (Principal + 0.2 Admin + 0.3 Coop = 3.5 XLM)
    fix.client.repay_credit(&fix.driver, &token);

    assert_eq!(fix.native_token.balance(&fix.admin), 2_000_000); // Admin got 0.2
    assert_eq!(fix.native_token.balance(&fix.coop), 53_000_000); // Coop kept 50 un-deposited + 3 fee
    assert_eq!(fix.native_token.balance(&fix.client.address), 50_000_000); // Pool fully restored
>>>>>>> 03d0158 (checkpoint)
}