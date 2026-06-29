#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env, token};

    // Test 1: Complete Happy Path validating Vault Deposits and Auto-Split Multi-User Payments
    #[test]
    fn test_vault_and_payment_autosplit_happy_path() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_wallet = Address::generate(&env);
        let sender = Address::generate(&env);
        let receiver = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract(token_admin.clone());
        let token_client = token::Client::new(&env, &token_contract);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);
        
        let contract_id = env.register_contract(None, AranovaContract);
        let client = AranovaContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_wallet);
        token_admin_client.mint(&sender, &1000);

        client.set_user_automation(&receiver, &2000, &false);
        client.process_payment(&sender, &receiver, &token_contract, &500);

        assert_eq!(token_client.balance(&receiver), 400);
        assert_eq!(token_client.balance(&contract_id), 100);
    }

    // Test 2: Core Lending and Debt Clear Mechanism
    #[test]
    fn test_universal_lending_and_vault_liquidation() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_wallet = Address::generate(&env);
        let borrower = Address::generate(&env);
        let pool_provider = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract(token_admin.clone());
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);
        
        let contract_id = env.register_contract(None, AranovaContract);
        let client = AranovaContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_wallet);
        token_admin_client.mint(&pool_provider, &10000);
        token_admin_client.mint(&borrower, &5000);

        // Uses universal deposit function (100% goes to pool since no contingency config is set)
        client.deposit_funds(&pool_provider, &token_contract, &5000);
        client.lock_in_vault(&borrower, &token_contract, &2000, &30);

        client.issue_universal_loan(&admin, &borrower, &token_contract, &1000);

        let active_loan: LoanRecord = client.get_active_loan(&borrower);
        assert_eq!(active_loan.balance, 1000);

        client.settle_debt_from_vault(&borrower, &token_contract);

        let cleared_loan: LoanRecord = client.get_active_loan(&borrower);
        assert_eq!(cleared_loan.balance, 0);
    }

    // Test 3: New Feature - Opt-in Contingency Vault, Split Routing & Maturity Withdrawal
    #[test]
    fn test_contingency_vault_opt_in_and_telegraphy() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_wallet = Address::generate(&env);
        let user = Address::generate(&env);
        
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract(token_admin.clone());
        let token_client = token::Client::new(&env, &token_contract);
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);

        let contract_id = env.register_contract(None, AranovaContract);
        let client = AranovaContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_wallet);
        token_admin_client.mint(&user, &10000);

        // 1. User configures contingency: 10% (1000 BPS) with a 30-day maturity
        client.configure_contingency(&user, &true, &1000, &30);

        // 2. User deposits 5000 tokens
        client.deposit_funds(&user, &token_contract, &5000);

        // 3. Verify the routing split: 500 (10%) to contingency vault
        let c_vault = client.get_contingency_vault(&user);
        assert_eq!(c_vault.balance, 500);

        // 4. Fast forward time by 31 days to simulate maturity
        let current_time = env.ledger().timestamp();
        env.ledger().set_timestamp(current_time + (31 * 86400));

        // 5. User claims their matured contingency vault funds
        client.withdraw_contingency(&user, &token_contract, &500);

        // 6. Verify funds are returned to user's wallet
        let remaining_vault = client.get_contingency_vault(&user);
        assert_eq!(remaining_vault.balance, 0);
        // Balance = 5000 (kept initially) + 500 (withdrawn) = 5500
        assert_eq!(token_client.balance(&user), 5500); 
    }

    // Test 4: Enforcing the strict sequential borrowing rule
    #[test]
    #[should_panic(expected = "Must settle existing daily fuel loan first")]
    fn test_sequential_borrowing_limit_rule() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_wallet = Address::generate(&env);
        let driver = Address::generate(&env);
        let pump = Address::generate(&env);
        let pool_provider = Address::generate(&env);
        
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract(token_admin.clone());
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);

        let contract_id = env.register_contract(None, AranovaContract);
        let client = AranovaContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_wallet);
        token_admin_client.mint(&pool_provider, &10000);
        client.deposit_funds(&pool_provider, &token_contract, &5000);
        client.set_partner_pump(&admin, &pump, true);
        client.set_driver_limit(&admin, &driver, 1000);

        client.issue_fuel_credit(&driver, &pump, &token_contract, &200);
        client.issue_fuel_credit(&driver, &pump, &token_contract, &200);
    }

    // Test 5: Validation of Administrative Forced Liquidation and Credit Slashes
    #[test]
    fn test_forced_liquidation_and_score_penalty() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let fee_wallet = Address::generate(&env);
        let user = Address::generate(&env);
        let pool_provider = Address::generate(&env);
        
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract(token_admin.clone());
        let token_admin_client = token::StellarAssetClient::new(&env, &token_contract);

        let contract_id = env.register_contract(None, AranovaContract);
        let client = AranovaContractClient::new(&env, &contract_id);

        client.initialize(&admin, &fee_wallet);
        token_admin_client.mint(&pool_provider, &10000);
        token_admin_client.mint(&user, &5000);

        client.deposit_funds(&pool_provider, &token_contract, &5000);
        client.lock_in_vault(&user, &token_contract, &2000, &30);

        client.issue_universal_loan(&admin, &user, &token_contract, &500);
        
        client.force_liquidate(&admin, &user, &token_contract);

        let active_loan: LoanRecord = client.get_active_loan(&user);
        assert_eq!(active_loan.balance, 0);
    }
}