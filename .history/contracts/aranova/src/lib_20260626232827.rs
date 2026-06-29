#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, symbol_short};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultData {
    pub balance: i128,
    pub unlock_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoanRecord {
    pub balance: i128,
    pub is_admin: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserConfig {
    pub auto_save_bps: i128,    // Percentage of daily earnings to auto-route to Vault
    pub auto_pay_enabled: bool, // Permission for administrative bots to trigger automated vault clearance
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContingencyConfig {
    pub is_active: bool,
    pub bps_split: i128,      // Percentage to route to contingency (e.g., 500 = 5%)
    pub duration_days: u64,   // Days until maturity
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContingencyVaultData {
    pub balance: i128,
    pub unlock_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    FeeWallet,
    CoopPool,             
    ActiveLoan(Address),  
    UserScore(Address),   
    PartnerPump(Address), 
    UserVault(Address),   
    UserPrefs(Address),   
    DriverLimit(Address),
    ContingencyPrefs(Address), // Stores User's ContingencyConfig
    UserContingency(Address),  // Stores User's ContingencyVaultData
}

const BPS_DIVIDER: i128 = 10000;

#[contract]
pub struct AranovaContract;

#[contractimpl]
impl AranovaContract {
    /// Initializes the smart contract state with primary global roles and system wallets.
    pub fn initialize(env: Env, admin: Address, fee_wallet: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeWallet, &fee_wallet);
        env.storage().instance().set(&DataKey::CoopPool, &0_i128);
    }

    /// Whitelists or deregisters a partner gas station pump asset receiver.
    pub fn set_partner_pump(env: Env, admin: Address, pump: Address, status: bool) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin { panic!("Unauthorized"); }
        env.storage().instance().set(&DataKey::PartnerPump(pump), &status);
    }

    /// Allows any user to opt-in, adjust their contingency split, and set a maturity date.
    pub fn configure_contingency(env: Env, user: Address, is_active: bool, bps_split: i128, duration_days: u64) {
        user.require_auth();
        if bps_split < 0 || bps_split > 10000 {
            panic!("Percentage must be between 0 and 10000 basis points");
        }

        let config = ContingencyConfig { is_active, bps_split, duration_days };
        env.storage().instance().set(&DataKey::ContingencyPrefs(user.clone()), &config);

        // TELEGRAPHY LOG: Broadcasts configuration changes to the network
        env.events().publish(
            (symbol_short!("TLGRPH"), symbol_short!("CfgCtgcy"), user.clone()), 
            (is_active, bps_split, duration_days)
        );
    }

    /// Universal deposit function. Reads the user's contingency settings to determine dynamic splits.
    pub fn deposit_funds(env: Env, user: Address, token_addr: Address, amount: i128) {
        user.require_auth();
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&user, &env.current_contract_address(), &amount);

        let prefs: ContingencyConfig = env.storage().instance().get(&DataKey::ContingencyPrefs(user.clone()))
            .unwrap_or(ContingencyConfig { is_active: false, bps_split: 0, duration_days: 0 });

        let mut contingency_share = 0;
        let mut pool_share = amount;

        if prefs.is_active && prefs.bps_split > 0 {
            contingency_share = (amount * prefs.bps_split) / BPS_DIVIDER;
            pool_share = amount - contingency_share;

            let mut c_vault: ContingencyVaultData = env.storage().instance().get(&DataKey::UserContingency(user.clone()))
                .unwrap_or(ContingencyVaultData { balance: 0, unlock_time: 0 });
            
            c_vault.balance += contingency_share;
            
            // Set or extend the maturity date based on the user's configured duration
            if c_vault.unlock_time <= env.ledger().timestamp() {
                c_vault.unlock_time = env.ledger().timestamp() + (prefs.duration_days * 86400);
            }
            
            env.storage().instance().set(&DataKey::UserContingency(user.clone()), &c_vault);
        }

        if pool_share > 0 {
            let current_pool: i128 = env.storage().instance().get(&DataKey::CoopPool).unwrap_or(0);
            env.storage().instance().set(&DataKey::CoopPool, &(current_pool + pool_share));
        }

        // TELEGRAPHY LOG: Broadcasts exact routing allocations
        env.events().publish(
            (symbol_short!("TLGRPH"), symbol_short!("Deposit"), user.clone()), 
            (pool_share, contingency_share)
        );
    }

    /// Allows users to withdraw funds from their contingency vault if the maturity date has passed.
    pub fn withdraw_contingency(env: Env, user: Address, token_addr: Address, amount: i128) {
        user.require_auth();
        let mut vault: ContingencyVaultData = env.storage().instance().get(&DataKey::UserContingency(user.clone()))
            .unwrap_or(ContingencyVaultData { balance: 0, unlock_time: 0 });

        if env.ledger().timestamp() < vault.unlock_time {
            panic!("Contingency vault is still time-locked");
        }
        if amount > vault.balance {
            panic!("Insufficient unlocked contingency balance");
        }

        vault.balance -= amount;
        env.storage().instance().set(&DataKey::UserContingency(user.clone()), &vault);

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &user, &amount);

        // TELEGRAPHY LOG: Broadcasts maturity claim
        env.events().publish(
            (symbol_short!("TLGRPH"), symbol_short!("Withdraw"), user.clone()), 
            amount
        );
    }

    /// Allows drivers, passengers, or cooperatives to configure automated settings for daily saving and clearing debt.
    pub fn set_user_automation(env: Env, user: Address, auto_save_bps: i128, auto_pay_enabled: bool) {
        user.require_auth();
        if auto_save_bps < 0 || auto_save_bps > 5000 {
            panic!("Max auto-save safety threshold capped at 50%");
        }
        let config = UserConfig { auto_save_bps, auto_pay_enabled };
        env.storage().instance().set(&DataKey::UserPrefs(user), &config);
    }

    /// Sets the maximum credit line ceiling allowed by the Cooperative administration for a given driver.
    pub fn set_driver_limit(env: Env, admin: Address, driver: Address, limit_amount: i128) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin { panic!("Unauthorized"); }
        env.storage().instance().set(&DataKey::DriverLimit(driver), &limit_amount);
    }

    /// Manually deposits capital into a user's local short-term savings vault.
    pub fn lock_in_vault(env: Env, user: Address, token_addr: Address, amount: i128, duration_days: u64) {
        user.require_auth();
        if duration_days != 7 && duration_days != 30 {
            panic!("Vault locks must be exactly 7 or 30 days");
        }

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&user, &env.current_contract_address(), &amount);

        let unlock_time = env.ledger().timestamp() + (duration_days * 86400);
        let mut vault: VaultData = env.storage().instance().get(&DataKey::UserVault(user.clone()))
            .unwrap_or(VaultData { balance: 0, unlock_time: 0 });
        
        vault.balance += amount;
        vault.unlock_time = unlock_time; 
        env.storage().instance().set(&DataKey::UserVault(user.clone()), &vault);

        let score: i128 = env.storage().instance().get(&DataKey::UserScore(user.clone())).unwrap_or(0);
        let boost = (amount / 10) + (if duration_days == 30 { 10 } else { 2 });
        env.storage().instance().set(&DataKey::UserScore(user.clone()), &(score + boost));
    }

    /// Processes economic payments between system identities, executing automated programmatic vault allocations.
    pub fn process_payment(env: Env, sender: Address, receiver: Address, token_addr: Address, amount: i128) {
        sender.require_auth(); 
        let client = token::Client::new(&env, &token_addr);

        let receiver_prefs = env.storage().instance().get(&DataKey::UserPrefs(receiver.clone()))
            .unwrap_or(UserConfig { auto_save_bps: 0, auto_pay_enabled: false });
        
        let mut receiver_takehome = amount;

        if receiver_prefs.auto_save_bps > 0 {
            let auto_save_amount = (amount * receiver_prefs.auto_save_bps) / BPS_DIVIDER;
            receiver_takehome = amount - auto_save_amount;

            client.transfer(&sender, &env.current_contract_address(), &auto_save_amount);

            let mut vault: VaultData = env.storage().instance().get(&DataKey::UserVault(receiver.clone()))
                .unwrap_or(VaultData { balance: 0, unlock_time: 0 });
            
            vault.balance += auto_save_amount;
            if vault.unlock_time == 0 {
                vault.unlock_time = env.ledger().timestamp() + (30 * 86400); 
            }
            env.storage().instance().set(&DataKey::UserVault(receiver.clone()), &vault);
        }

        if receiver_takehome > 0 {
            client.transfer(&sender, &receiver, &receiver_takehome);
        }

        let s_score: i128 = env.storage().instance().get(&DataKey::UserScore(sender.clone())).unwrap_or(0);
        env.storage().instance().set(&DataKey::UserScore(sender.clone()), &(s_score + 1));

        let r_score: i128 = env.storage().instance().get(&DataKey::UserScore(receiver.clone())).unwrap_or(0);
        env.storage().instance().set(&DataKey::UserScore(receiver.clone()), &(r_score + 1));
    }

    /// Allows high-score Drivers to tap micro-loans routed directly to a whitelisted pump.
    pub fn issue_fuel_credit(env: Env, driver: Address, pump_wallet: Address, token_addr: Address, amount: i128) {
        driver.require_auth();

        let is_partner = env.storage().instance().get(&DataKey::PartnerPump(pump_wallet.clone())).unwrap_or(false);
        if !is_partner { panic!("Pump target not whitelisted"); }

        let active_loan: LoanRecord = env.storage().instance().get(&DataKey::ActiveLoan(driver.clone()))
            .unwrap_or(LoanRecord { balance: 0, is_admin: false });
        if active_loan.balance > 0 { panic!("Must settle existing daily fuel loan first"); }

        let driver_limit = env.storage().instance().get(&DataKey::DriverLimit(driver.clone())).unwrap_or(0);
        if amount > driver_limit { panic!("Exceeds cooperative assigned credit limit"); }

        let mut current_pool: i128 = env.storage().instance().get(&DataKey::CoopPool).unwrap_or(0);
        if current_pool < amount { panic!("Liquidity pool exhausted"); }

        current_pool -= amount;
        env.storage().instance().set(&DataKey::CoopPool, &current_pool);
        
        env.storage().instance().set(&DataKey::ActiveLoan(driver.clone()), &LoanRecord { balance: amount, is_admin: false });

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &pump_wallet, &amount);
    }

    /// Universal administrative lending facility supporting based on trust index.
    pub fn issue_universal_loan(env: Env, admin: Address, borrower: Address, token_addr: Address, amount: i128) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin { panic!("Unauthorized"); }

        let score: i128 = env.storage().instance().get(&DataKey::UserScore(borrower.clone())).unwrap_or(0);
        if score < 10 { panic!("Borrower credit score fails safety margin"); }

        let mut current_pool: i128 = env.storage().instance().get(&DataKey::CoopPool).unwrap_or(0);
        if current_pool < amount { panic!("Insufficient pool allocation"); }

        current_pool -= amount;
        env.storage().instance().set(&DataKey::CoopPool, &current_pool);

        let active_loan: LoanRecord = env.storage().instance().get(&DataKey::ActiveLoan(borrower.clone()))
            .unwrap_or(LoanRecord { balance: 0, is_admin: false });
        
        env.storage().instance().set(&DataKey::ActiveLoan(borrower.clone()), &LoanRecord {
            balance: active_loan.balance + amount,
            is_admin: true
        });
        
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &borrower, &amount);
    }

    /// Standard user-authorized macro execution to resolve obligations.
    pub fn settle_debt_from_vault(env: Env, user: Address, token_addr: Address) {
        user.require_auth();
        let active_loan: LoanRecord = env.storage().instance().get(&DataKey::ActiveLoan(user.clone()))
            .unwrap_or(LoanRecord { balance: 0, is_admin: false });
        if active_loan.balance == 0 { panic!("No outstanding debt found"); }

        let mut vault: VaultData = env.storage().instance().get(&DataKey::UserVault(user.clone()))
            .unwrap_or(VaultData { balance: 0, unlock_time: 0 });
        
        let mut superadmin_fee = (active_loan.balance * 20) / BPS_DIVIDER; 
        let pool_yield_fee = (active_loan.balance * 30) / BPS_DIVIDER;      

        if active_loan.is_admin {
            superadmin_fee += (active_loan.balance * 100) / BPS_DIVIDER;
        }

        let total_deduction = active_loan.balance + superadmin_fee + pool_yield_fee;
        if vault.balance < total_deduction { panic!("Insufficient vault funds to clear obligation"); }

        vault.balance -= total_deduction;
        env.storage().instance().set(&DataKey::UserVault(user.clone()), &vault);
        env.storage().instance().set(&DataKey::ActiveLoan(user.clone()), &LoanRecord { balance: 0, is_admin: false });

        let client = token::Client::new(&env, &token_addr);
        if superadmin_fee > 0 {
            let fee_recipient: Address = env.storage().instance().get(&DataKey::FeeWallet).unwrap();
            client.transfer(&env.current_contract_address(), &fee_recipient, &superadmin_fee);
        }

        let current_pool: i128 = env.storage().instance().get(&DataKey::CoopPool).unwrap_or(0);
        env.storage().instance().set(&DataKey::CoopPool, &(current_pool + active_loan.balance + pool_yield_fee));

        let current_score: i128 = env.storage().instance().get(&DataKey::UserScore(user.clone())).unwrap_or(0);
        env.storage().instance().set(&DataKey::UserScore(user.clone()), &(current_score + 5)); 
    }

    /// Triggered automatically by programmatic administration agents.
    pub fn trigger_auto_pay(env: Env, admin: Address, user: Address, token_addr: Address) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin { panic!("Unauthorized"); }

        let user_prefs: UserConfig = env.storage().instance().get(&DataKey::UserPrefs(user.clone()))
            .unwrap_or(UserConfig { auto_save_bps: 0, auto_pay_enabled: false });
        if !user_prefs.auto_pay_enabled { panic!("User has not enabled auto-pay routines"); }

        let active_loan: LoanRecord = env.storage().instance().get(&DataKey::ActiveLoan(user.clone()))
            .unwrap_or(LoanRecord { balance: 0, is_admin: false });
        if active_loan.balance == 0 { panic!("No debt to auto-clear"); }

        let mut vault: VaultData = env.storage().instance().get(&DataKey::UserVault(user.clone()))
            .unwrap_or(VaultData { balance: 0, unlock_time: 0 });
        
        let mut superadmin_fee = (active_loan.balance * 20) / BPS_DIVIDER; 
        let pool_yield_fee = (active_loan.balance * 30) / BPS_DIVIDER;  

        if active_loan.is_admin {
            superadmin_fee += (active_loan.balance * 100) / BPS_DIVIDER;
        }

        let total_deduction = active_loan.balance + superadmin_fee + pool_yield_fee;
        if vault.balance < total_deduction { panic!("Auto-save balance insufficient for automated settlement"); }

        vault.balance -= total_deduction;
        env.storage().instance().set(&DataKey::UserVault(user.clone()), &vault);
        env.storage().instance().set(&DataKey::ActiveLoan(user.clone()), &LoanRecord { balance: 0, is_admin: false });

        let client = token::Client::new(&env, &token_addr);
        if superadmin_fee > 0 {
            let fee_recipient: Address = env.storage().instance().get(&DataKey::FeeWallet).unwrap();
            client.transfer(&env.current_contract_address(), &fee_recipient, &superadmin_fee);
        }

        let current_pool: i128 = env.storage().instance().get(&DataKey::CoopPool).unwrap_or(0);
        env.storage().instance().set(&DataKey::CoopPool, &(current_pool + active_loan.balance + pool_yield_fee));

        let current_score: i128 = env.storage().instance().get(&DataKey::UserScore(user.clone())).unwrap_or(0);
        env.storage().instance().set(&DataKey::UserScore(user.clone()), &(current_score + 5)); 
    }

    /// Admin forced intervention mechanism to claim collateral reserves from defaulting actors.
    pub fn force_liquidate(env: Env, admin: Address, user: Address, token_addr: Address) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin { panic!("Unauthorized"); }

        let active_loan: LoanRecord = env.storage().instance().get(&DataKey::ActiveLoan(user.clone()))
            .unwrap_or(LoanRecord { balance: 0, is_admin: false });
        if active_loan.balance == 0 { panic!("No defaultable asset layers present"); }

        let mut vault: VaultData = env.storage().instance().get(&DataKey::UserVault(user.clone()))
            .unwrap_or(VaultData { balance: 0, unlock_time: 0 });
        
        let mut superadmin_fee = (active_loan.balance * 20) / BPS_DIVIDER; 
        let pool_yield_fee = (active_loan.balance * 30) / BPS_DIVIDER;  

        if active_loan.is_admin {
            superadmin_fee += (active_loan.balance * 100) / BPS_DIVIDER;
        }

        let total_deduction = active_loan.balance + superadmin_fee + pool_yield_fee;
        if vault.balance < total_deduction { panic!("System risk event: Under-collateralization breach"); }

        vault.balance -= total_deduction;
        env.storage().instance().set(&DataKey::UserVault(user.clone()), &vault);
        env.storage().instance().set(&DataKey::ActiveLoan(user.clone()), &LoanRecord { balance: 0, is_admin: false });

        let client = token::Client::new(&env, &token_addr);
        if superadmin_fee > 0 {
            let fee_recipient: Address = env.storage().instance().get(&DataKey::FeeWallet).unwrap();
            client.transfer(&env.current_contract_address(), &fee_recipient, &superadmin_fee);
        }

        let current_pool: i128 = env.storage().instance().get(&DataKey::CoopPool).unwrap_or(0);
        env.storage().instance().set(&DataKey::CoopPool, &(current_pool + active_loan.balance + pool_yield_fee));

        let current_score: i128 = env.storage().instance().get(&DataKey::UserScore(user.clone())).unwrap_or(0);
        let penalized_score = if current_score > 30 { current_score - 30 } else { 0 };
        env.storage().instance().set(&DataKey::UserScore(user.clone()), &penalized_score); 
    }

    // ==========================================
    // VIEW FUNCTIONS
    // ==========================================
    
    pub fn get_active_loan(env: Env, user: Address) -> LoanRecord {
        env.storage().instance().get(&DataKey::ActiveLoan(user)).unwrap_or(LoanRecord { balance: 0, is_admin: false })
    }

    pub fn get_user_vault(env: Env, user: Address) -> VaultData {
        env.storage().instance().get(&DataKey::UserVault(user)).unwrap_or(VaultData { balance: 0, unlock_time: 0 })
    }

    pub fn get_contingency_vault(env: Env, user: Address) -> ContingencyVaultData {
        env.storage().instance().get(&DataKey::UserContingency(user)).unwrap_or(ContingencyVaultData { balance: 0, unlock_time: 0 })
    }
}