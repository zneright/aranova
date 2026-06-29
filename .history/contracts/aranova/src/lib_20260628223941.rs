#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

const BPS_DIVIDER: i128 = 10000;
const DAY_IN_SECONDS: u64 = 86400;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultConfig {
    pub is_active: bool,
    pub auto_save_bps: i128, // e.g., 500 = 5%
    pub duration_days: u64,
    pub balance: i128,
    pub unlock_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FuelLoan {
    pub principal: i128,
    pub timestamp: u64,
    pub coop_wallet: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminLoan {
    pub principal: i128,
    pub interest_bps: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    AdminWallet,
    CoopLimit(Address),       // Limit set by Coop for a specific driver
    UserScore(Address),       // The all-important Trust Score (Default starts at 700)
    ActiveFuelLoan(Address),  // Driver's active fuel credit
    ActiveAdminLoan(Address), // User's active admin loan
    UserVault(Address),       // User's optional vault settings and balance
    LastRewardDay(Address),   // Tracks the day index to enforce "once per day" score boosts
}

#[contract]
pub struct AranovaContract;

#[contractimpl]
impl AranovaContract {
    /// Initializes the smart contract state with the supreme admin wallet.
    pub fn initialize(env: Env, admin_wallet: Address) {
        if env.storage().instance().has(&DataKey::AdminWallet) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::AdminWallet, &admin_wallet);
    }

    // ==========================================
    // 1. UNIVERSAL PAY & RECEIVE (ALL USERS)
    // ==========================================

    /// Universal Pay & Receive for ALL users. Handles auto-vault routing and trust score bumps.
    pub fn process_payment(env: Env, sender: Address, receiver: Address, token_addr: Address, amount: i128) {
        sender.require_auth();
        let client = token::Client::new(&env, &token_addr);

        // Check if the receiver has an active vault setup
        let vault: VaultConfig = env.storage().instance().get(&DataKey::UserVault(receiver.clone()))
            .unwrap_or(VaultConfig { is_active: false, auto_save_bps: 0, duration_days: 0, balance: 0, unlock_time: 0 });

        let mut receiver_takehome = amount;
        let mut vault_save_amount = 0;

        // If receiver's vault is ON, slice off the percentage automatically
        if vault.is_active && vault.auto_save_bps > 0 {
            vault_save_amount = (amount * vault.auto_save_bps) / BPS_DIVIDER;
            receiver_takehome = amount - vault_save_amount;

            // Route the saved portion into the contract's vault custody
            client.transfer(&sender, &env.current_contract_address(), &vault_save_amount);

            let mut updated_vault = vault.clone();
            updated_vault.balance += vault_save_amount;
            
            // If the vault doesn't have an active timer, start the clock right now
            if updated_vault.unlock_time <= env.ledger().timestamp() {
                updated_vault.unlock_time = env.ledger().timestamp() + (updated_vault.duration_days * DAY_IN_SECONDS);
            }
            env.storage().instance().set(&DataKey::UserVault(receiver.clone()), &updated_vault);
        }

        // Send the remaining take-home fare directly to the receiver's main wallet
        if receiver_takehome > 0 {
            client.transfer(&sender, &receiver, &receiver_takehome);
        }

        // ECOSYSTEM REWARD: Both the sender and receiver get a +1 Trust Score bump for transacting
        let s_score: i128 = env.storage().instance().get(&DataKey::UserScore(sender.clone())).unwrap_or(700);
        env.storage().instance().set(&DataKey::UserScore(sender), &(s_score + 1));

        let r_score: i128 = env.storage().instance().get(&DataKey::UserScore(receiver.clone())).unwrap_or(700);
        env.storage().instance().set(&DataKey::UserScore(receiver.clone()), &(r_score + 1));
    }

    // ==========================================
    // 2. VAULT LOGIC (ALL USERS)
    // ==========================================

    /// Users opt-in to the vault, setting their deduction percentage and lock time.
    pub fn configure_vault(env: Env, user: Address, is_active: bool, auto_save_bps: i128, duration_days: u64) {
        user.require_auth();
        let mut vault: VaultConfig = env.storage().instance().get(&DataKey::UserVault(user.clone()))
            .unwrap_or(VaultConfig { is_active: false, auto_save_bps: 0, duration_days: 0, balance: 0, unlock_time: 0 });
        
        vault.is_active = is_active;
        vault.auto_save_bps = auto_save_bps;
        vault.duration_days = duration_days;
        env.storage().instance().set(&DataKey::UserVault(user), &vault);
    }

    /// Direct manual deposit to vault. Massively boosts Trust Score based on Amount + Time.
    pub fn lock_in_vault(env: Env, user: Address, token_addr: Address, amount: i128) {
        user.require_auth();
        let mut vault: VaultConfig = env.storage().instance().get(&DataKey::UserVault(user.clone()))
            .unwrap_or(VaultConfig { is_active: false, auto_save_bps: 0, duration_days: 30, balance: 0, unlock_time: 0 });
        
        if !vault.is_active { panic!("Vault is not active"); }

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&user, &env.current_contract_address(), &amount);

        vault.balance += amount;
        
        // Reset or extend the unlock timer based on user configuration
        vault.unlock_time = env.ledger().timestamp() + (vault.duration_days * DAY_IN_SECONDS);
        env.storage().instance().set(&DataKey::UserVault(user.clone()), &vault);

        // Trust Score soars based on XLM locked and duration
        let score_boost = (amount / 10) * (vault.duration_days as i128);
        let current_score: i128 = env.storage().instance().get(&DataKey::UserScore(user.clone())).unwrap_or(700);
        env.storage().instance().set(&DataKey::UserScore(user), &(current_score + score_boost));
    }

    /// Allows ANY user to withdraw their saved funds once the maturity date hits.
    pub fn withdraw_from_vault(env: Env, user: Address, token_addr: Address, amount: i128) {
        user.require_auth();
        
        let mut vault: VaultConfig = env.storage().instance().get(&DataKey::UserVault(user.clone()))
            .unwrap_or(VaultConfig { is_active: false, auto_save_bps: 0, duration_days: 0, balance: 0, unlock_time: 0 });

        if env.ledger().timestamp() < vault.unlock_time {
            panic!("Vault is still time-locked! Wait for maturity date.");
        }
        
        if amount > vault.balance {
            panic!("Insufficient unlocked funds in the vault.");
        }

        vault.balance -= amount;
        env.storage().instance().set(&DataKey::UserVault(user.clone()), &vault);

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &user, &amount);
    }

    // ==========================================
    // 3. FUEL CREDIT LOGIC (DRIVER -> COOP)
    // ==========================================

    /// Coop assigns the ceiling limit for a specific driver.
    pub fn set_driver_limit(env: Env, coop: Address, driver: Address, limit: i128) {
        coop.require_auth();
        env.storage().instance().set(&DataKey::CoopLimit(driver), &limit);
    }

    /// Automatically deducts from Coop Wallet -> Sends to target pump.
    pub fn issue_fuel_credit(env: Env, driver: Address, coop_wallet: Address, target_pump: Address, token_addr: Address, amount: i128) {
        driver.require_auth(); 
        
        // 1. Check Limits & Existing Debt
        let active_loan: FuelLoan = env.storage().instance().get(&DataKey::ActiveFuelLoan(driver.clone()))
            .unwrap_or(FuelLoan { principal: 0, timestamp: 0, coop_wallet: coop_wallet.clone() });
        if active_loan.principal > 0 { panic!("Must settle existing fuel loan first."); }

        let limit: i128 = env.storage().instance().get(&DataKey::CoopLimit(driver.clone())).unwrap_or(0);
        if amount > limit { panic!("Exceeds Cooperative approved limit."); }

        // 2. Transfer from Coop to Pump (Coop must have granted allowance to contract)
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&coop_wallet, &target_pump, &amount);

        // 3. Record the Loan
        let new_loan = FuelLoan {
            principal: amount,
            timestamp: env.ledger().timestamp(),
            coop_wallet,
        };
        env.storage().instance().set(&DataKey::ActiveFuelLoan(driver), &new_loan);
    }

    /// Driver repays fuel credit directly from their wallet. 
    /// Math: 0.2% to Admin, 0.3% + Principal to Coop. Applies time-based trust score rules.
    pub fn repay_fuel_credit(env: Env, driver: Address, token_addr: Address) {
        driver.require_auth();
        
        let loan: FuelLoan = env.storage().instance().get(&DataKey::ActiveFuelLoan(driver.clone())).unwrap();
        if loan.principal == 0 { panic!("No active fuel credit."); }

        let admin_fee = (loan.principal * 20) / BPS_DIVIDER; // 0.2%
        let coop_fee = (loan.principal * 30) / BPS_DIVIDER;  // 0.3%
        let total_deduction = loan.principal + admin_fee + coop_fee;

        let client = token::Client::new(&env, &token_addr);
        let admin_wallet: Address = env.storage().instance().get(&DataKey::AdminWallet).unwrap();

        // Pull total deduction from Driver
        client.transfer(&driver, &env.current_contract_address(), &total_deduction);
        
        // Route payouts
        client.transfer(&env.current_contract_address(), &admin_wallet, &admin_fee);
        client.transfer(&env.current_contract_address(), &loan.coop_wallet, &(loan.principal + coop_fee));

        // Clear active loan
        env.storage().instance().set(&DataKey::ActiveFuelLoan(driver.clone()), &FuelLoan { principal: 0, timestamp: 0, coop_wallet: loan.coop_wallet });

        // Trust Score Evaluation: Were they fast or late?
        let current_time = env.ledger().timestamp();
        let current_day = current_time / DAY_IN_SECONDS;
        let mut score: i128 = env.storage().instance().get(&DataKey::UserScore(driver.clone())).unwrap_or(700);

        if current_time > loan.timestamp + DAY_IN_SECONDS {
            // LATE PAYER: Heavy Penalty (-20)
            score -= 20; 
        } else {
            // GOOD PAYER: Assure they only get the boost (+5) once per day max
            let last_reward_day: u64 = env.storage().instance().get(&DataKey::LastRewardDay(driver.clone())).unwrap_or(0);
            if current_day > last_reward_day {
                score += 5; 
                env.storage().instance().set(&DataKey::LastRewardDay(driver.clone()), &current_day);
            }
        }
        env.storage().instance().set(&DataKey::UserScore(driver), &score);
    }

    // ==========================================
    // 4. ADMIN LOANS (BASED STRICTLY ON TRUST SCORE)
    // ==========================================

    /// Admin approves a loan to ANY user. Max limits and interest bound dynamically by Trust Score.
    pub fn issue_admin_loan(env: Env, admin: Address, user: Address, token_addr: Address, amount: i128, interest_bps: i128) {
        admin.require_auth();
        let admin_wallet: Address = env.storage().instance().get(&DataKey::AdminWallet).unwrap();
        if admin != admin_wallet { panic!("Only Admin Wallet can issue admin loans."); }

        let score: i128 = env.storage().instance().get(&DataKey::UserScore(user.clone())).unwrap_or(700);
        
        // Safety constraint: Maximum XLM allowed to borrow is 2x their Trust Score
        let max_allowed = score * 2; 
        if amount > max_allowed { panic!("Requested amount exceeds Trust Score constraints."); }

        // Dynamic Interest Constraint: High Trust = Protected from high interest
        if score > 1000 && interest_bps > 500 { panic!("Interest rate too high for premium trust score."); }

        let client = token::Client::new(&env, &token_addr);
        client.transfer(&admin_wallet, &user, &amount);

        env.storage().instance().set(&DataKey::ActiveAdminLoan(user), &AdminLoan { principal: amount, interest_bps });
    }
    
    // ==========================================
    // VIEW FUNCTIONS
    // ==========================================
    
    pub fn get_user_score(env: Env, user: Address) -> i128 {
        env.storage().instance().get(&DataKey::UserScore(user)).unwrap_or(700)
    }

    pub fn get_vault(env: Env, user: Address) -> VaultConfig {
        env.storage().instance().get(&DataKey::UserVault(user))
            .unwrap_or(VaultConfig { is_active: false, auto_save_bps: 0, duration_days: 0, balance: 0, unlock_time: 0 })
    }

    pub fn get_active_fuel_loan(env: Env, driver: Address) -> FuelLoan {
        let dummy_coop = Address::from_string(&soroban_sdk::String::from_str(&env, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"));
        env.storage().instance().get(&DataKey::ActiveFuelLoan(driver))
            .unwrap_or(FuelLoan { principal: 0, timestamp: 0, coop_wallet: dummy_coop })
    }
}