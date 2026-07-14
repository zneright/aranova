#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, vec, token, Address, Env, Symbol, Val, IntoVal};

use trust_contract::TrustContractClient;


#[contracttype]
pub enum DataKey {
    Admin,
    TrustContract,
    Pool(Address),
    TotalDeposits(Address),
    Loan(Address),
    CoopConfig(Address),
    InterestSplit, // bps for admin share
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoanRecord {
    pub principal: i128,
    pub coop: Address,
    pub approved_amount: i128,
    pub interest_rate_bps: i128,
    pub duration_days: u32,
    pub disbursed_at: u64, // Ledger timestamp in seconds
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CoopConfig {
    pub max_fuel_credit: i128,
    pub min_trust_score: i128,
    pub interest_rate_bps: i128,
    pub lending_enabled: bool,
    pub max_concurrent_loans: u32,
    pub reserve_ratio_bps: i128, // e.g. 2000 for 20%
}

#[contract]
pub struct FuelCreditContract;

#[contractimpl]
impl FuelCreditContract {
    pub fn init(env: Env, admin: Address, trust_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TrustContract, &trust_contract);
        env.storage().instance().set(&DataKey::InterestSplit, &4000i128); // 40% default admin share
    }

    pub fn set_interest_split(env: Env, admin_share_bps: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        if admin_share_bps < 0 || admin_share_bps > 10000 {
            panic!("basis points must be between 0 and 10000");
        }
        env.storage().instance().set(&DataKey::InterestSplit, &admin_share_bps);
    }

    pub fn get_interest_split(env: Env) -> i128 {
        env.storage().instance().get::<_, i128>(&DataKey::InterestSplit).unwrap_or(4000)
    }

    pub fn set_coop_config(env: Env, coop: Address, config: CoopConfig) {
        coop.require_auth();
        env.storage().persistent().set(&DataKey::CoopConfig(coop), &config);
    }

    pub fn get_coop_config(env: Env, coop: Address) -> Option<CoopConfig> {
        env.storage().persistent().get(&DataKey::CoopConfig(coop))
    }

    pub fn deposit_pool(env: Env, coop: Address, token: Address, amount: i128) {
        coop.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let client = token::Client::new(&env, &token);
        client.transfer(&coop, &env.current_contract_address(), &amount);

        let mut pool = env.storage().persistent().get(&DataKey::Pool(coop.clone())).unwrap_or(0);
        pool += amount;
        env.storage().persistent().set(&DataKey::Pool(coop.clone()), &pool);

        let mut total = env.storage().persistent().get(&DataKey::TotalDeposits(coop.clone())).unwrap_or(0);
        total += amount;
        env.storage().persistent().set(&DataKey::TotalDeposits(coop.clone()), &total);

        env.events().publish(
            (Symbol::new(&env, "deposit_pool"), coop),
            amount
        );
    }

    pub fn request_fuel_credit(env: Env, driver: Address, coop: Address, token: Address, amount: i128) {
        driver.require_auth();
        if amount <= 0 {
            panic!("requested amount must be positive");
        }

        let config = Self::get_coop_config(env.clone(), coop.clone())
            .unwrap_or_else(|| panic!("cooperative is not configured"));

        if !config.lending_enabled {
            panic!("cooperative lending is disabled");
        }

        // Validate outstanding loans
        if env.storage().persistent().has(&DataKey::Loan(driver.clone())) {
            panic!("driver already has an active fuel loan");
        }

        // Validate trust score on Trust Contract
        let trust_contract_address: Address = env.storage().instance().get(&DataKey::TrustContract).unwrap();
        let trust_client = TrustContractClient::new(&env, &trust_contract_address);
        let trust_score = trust_client.get_trust_score(&driver);
        if trust_score < config.min_trust_score {
            panic!("driver trust score is too low");
        }

        if amount > config.max_fuel_credit {
            panic!("requested amount exceeds cooperative credit ceiling");
        }

        // Verify pool balance and reserve ratio
        let mut pool = env.storage().persistent().get(&DataKey::Pool(coop.clone())).unwrap_or(0);
        let total_deposits = env.storage().persistent().get(&DataKey::TotalDeposits(coop.clone())).unwrap_or(0);
        let reserve_required = (total_deposits * config.reserve_ratio_bps) / 10000;
        
        let available_for_lending = pool - reserve_required;
        if available_for_lending <= 0 {
            panic!("insufficient pool balance under cooperative reserve ratio rules");
        }

        let mut approved_amount = amount;
        if approved_amount > available_for_lending {
            approved_amount = available_for_lending;
        }

        pool -= approved_amount;
        env.storage().persistent().set(&DataKey::Pool(coop.clone()), &pool);
        env.storage().persistent().set(
            &DataKey::Loan(driver.clone()),
            &LoanRecord {
                principal: approved_amount,
                coop: coop.clone(),
                approved_amount,
                interest_rate_bps: config.interest_rate_bps,
                duration_days: 30,
                disbursed_at: env.ledger().timestamp(),
            },
        );

        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &driver, &approved_amount);

        env.events().publish(
            (Symbol::new(&env, "release_credit"), coop, driver),
            (approved_amount, config.interest_rate_bps, 30u32)
        );
    }

    pub fn repay_credit(env: Env, driver: Address, token: Address) {
        driver.require_auth();

        let loan: LoanRecord = env.storage().persistent().get(&DataKey::Loan(driver.clone()))
            .unwrap_or_else(|| panic!("no active loan found"));
        
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        let trust_contract_address: Address = env.storage().instance().get(&DataKey::TrustContract).unwrap();

        // Calculate dynamic interest based on interest_rate_bps (annualized)
        let interest = (loan.principal * loan.interest_rate_bps * loan.duration_days as i128) / (10_000 * 365);
        let admin_share_bps = Self::get_interest_split(env.clone());
        let admin_fee = (interest * admin_share_bps) / 10000;
        let coop_fee = interest - admin_fee;
        let total_due = loan.principal + interest;

        let client = token::Client::new(&env, &token);
        client.transfer(&driver, &env.current_contract_address(), &total_due);
        
        if admin_fee > 0 {
            client.transfer(&env.current_contract_address(), &admin, &admin_fee);
        }
        if coop_fee > 0 {
            client.transfer(&env.current_contract_address(), &loan.coop, &coop_fee);
        }

        let mut pool = env.storage().persistent().get(&DataKey::Pool(loan.coop.clone())).unwrap_or(0);
        pool += loan.principal;
        env.storage().persistent().set(&DataKey::Pool(loan.coop.clone()), &pool);
        env.storage().persistent().remove(&DataKey::Loan(driver.clone()));

        // Check if repayment is on-time or late
        let now = env.ledger().timestamp();
        let due_time = loan.disbursed_at + (loan.duration_days as u64 * 24 * 60 * 60);
        let trust_client = TrustContractClient::new(&env, &trust_contract_address);
        if now <= due_time {
            trust_client.record_event(&driver, &1);
        } else {
            trust_client.record_event(&driver, &4);
        }

        trust_client.record_event(&driver, &3);

        env.events().publish(
            (Symbol::new(&env, "repay_credit"), driver, loan.coop),
            (loan.principal, interest)
        );
    }

    pub fn repay_partial(env: Env, driver: Address, token: Address, amount: i128) {
        driver.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let mut loan: LoanRecord = env.storage().persistent().get(&DataKey::Loan(driver.clone()))
            .unwrap_or_else(|| panic!("no active loan found"));
            
        if amount >= loan.principal {
            Self::repay_credit(env, driver, token);
            return;
        }

        let client = token::Client::new(&env, &token);
        client.transfer(&driver, &env.current_contract_address(), &amount);

        let mut pool = env.storage().persistent().get(&DataKey::Pool(loan.coop.clone())).unwrap_or(0);
        pool += amount;
        env.storage().persistent().set(&DataKey::Pool(loan.coop.clone()), &pool);

        loan.principal -= amount;
        env.storage().persistent().set(&DataKey::Loan(driver.clone()), &loan);

        env.events().publish(
            (Symbol::new(&env, "repay_partial"), driver, loan.coop),
            amount
        );
    }

    pub fn get_pool(env: Env, coop: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Pool(coop)).unwrap_or(0)
    }

    pub fn get_loan(env: Env, driver: Address) -> Option<LoanRecord> {
        env.storage().persistent().get(&DataKey::Loan(driver))
    }
}

#[cfg(test)]
mod test;

