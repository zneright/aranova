#![cfg(test)]
use super::{VaultContract, VaultContractClient, VaultRules};
use soroban_sdk::{contract, contractimpl, testutils::Address as _, token, Address, Env, IntoVal, Symbol, testutils::Ledger};

#[contract]
pub struct MockTrustContract;

#[contractimpl]
impl MockTrustContract {
    pub fn record_event(env: Env, user: Address, event_type: u32) {
        env.events().publish((Symbol::new(&env, "mock_record_event"), user), event_type);
    }
    pub fn get_trust_score(env: Env, user: Address) -> i128 { 30 }
}

#[test]
fn test_vault_matured_redemption() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let reserve = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token = token::Client::new(&env, &token_id);
    let asset = token::StellarAssetClient::new(&env, &token_id);

    let trust_id = env.register_contract(None, MockTrustContract);
    let vault_id = env.register_contract(None, VaultContract);
    let vault = VaultContractClient::new(&env, &vault_id);

    vault.init(&admin, &trust_id, &reserve);

    asset.mint(&owner, &10_000_000);

    let lock_id = vault.lock_vault(&owner, &token_id, &4_000_000, &30);
    assert_eq!(lock_id, 1);
    assert_eq!(vault.get_vault_balance(&owner), 4_000_000);
    assert_eq!(token.balance(&owner), 6_000_000);

    env.ledger().with_mut(|li| {
        li.timestamp = 31 * 24 * 60 * 60;
    });

    vault.redeem_vault(&owner, &token_id, &1);
    assert_eq!(vault.get_vault_balance(&owner), 0);
    assert_eq!(token.balance(&owner), 10_000_000);
}

#[test]
fn test_vault_emergency_unlock_with_penalty() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let reserve = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token = token::Client::new(&env, &token_id);
    let asset = token::StellarAssetClient::new(&env, &token_id);

    let trust_id = env.register_contract(None, MockTrustContract);
    let vault_id = env.register_contract(None, VaultContract);
    let vault = VaultContractClient::new(&env, &vault_id);

    vault.init(&admin, &trust_id, &reserve);

    vault.set_vault_rules(&VaultRules {
        penalty_bps: 1000,
        min_lock_days: 30,
        max_auto_lock_pct: 50,
        max_manual_lock: 100_000_000,
    });

    asset.mint(&owner, &10_000_000);

    vault.lock_vault(&owner, &token_id, &4_000_000, &30);

    vault.redeem_vault(&owner, &token_id, &1);

    assert_eq!(vault.get_vault_balance(&owner), 0);
    assert_eq!(token.balance(&owner), 6_000_000 + 3_600_000);
    assert_eq!(token.balance(&reserve), 400_000);
}
