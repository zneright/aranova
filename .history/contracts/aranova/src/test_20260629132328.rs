#![cfg(test)]
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
}