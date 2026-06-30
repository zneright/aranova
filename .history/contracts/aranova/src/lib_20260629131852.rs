#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

const ADMIN_FEE: i128 = 2_000_000; // 0.2 XLM (in stroops: 1 XLM = 10,000,000)
const COOP_FEE: i128 = 3_000_000;  // 0.3 XLM

#[contracttype]
pub enum DataKey {
    Admin,
    Pool(Address), // Coop Address -> Pool Balance (i128)
    Loan(Address), // Driver Address -> LoanRecord
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoanRecord {
    pub principal: i128,
    pub coop: Address,
}

#[contract]
pub struct AranovaContract;

#[contractimpl]
impl AranovaContract {
    /// 1. Initialize the Admin Wallet
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// 2. Cooperative deposits funds into their Fuel Pool
    pub fn deposit_pool(env: Env, coop: Address, token: Address, amount: i128) {
        coop.require_auth();
        let client = token::Client::new(&env, &token);
        
        // Transfer from Coop to Contract
        client.transfer(&coop, &env.current_contract_address(), &amount);

        // Update Pool Balance
        let mut balance: i128 = env.storage().persistent().get(&DataKey::Pool(coop.clone())).unwrap_or(0);
        balance += amount;
        env.storage().persistent().set(&DataKey::Pool(coop), &balance);
    }

    /// 3. Cooperative approves and releases funds to a Driver
    pub fn release_credit(env: Env, coop: Address, driver: Address, token: Address, amount: i128) {
        coop.require_auth();
        
        let mut balance: i128 = env.storage().persistent().get(&DataKey::Pool(coop.clone())).unwrap_or(0);
        if balance < amount { panic!("Insufficient pool balance"); }
        
        if env.storage().persistent().has(&DataKey::Loan(driver.clone())) {
            panic!("Driver already has an active loan");
        }

        // Deduct from Pool
        balance -= amount;
        env.storage().persistent().set(&DataKey::Pool(coop.clone()), &balance);

        // Record the Loan
        env.storage().persistent().set(&DataKey::Loan(driver.clone()), &LoanRecord { 
            principal: amount, 
            coop: coop.clone() 
        });

        // Transfer funds from Contract to Driver
        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &driver, &amount);
    }

    /// 4. Driver repays the loan. Contract automatically routes the strict splits.
    pub fn repay_credit(env: Env, driver: Address, token: Address) {
        driver.require_auth();
        
        let loan: LoanRecord = env.storage().persistent().get(&DataKey::Loan(driver.clone())).unwrap();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        
        let total_due = loan.principal + ADMIN_FEE + COOP_FEE;
        let client = token::Client::new(&env, &token);

        // Pull total repayment from Driver
        client.transfer(&driver, &env.current_contract_address(), &total_due);

        // Distribute fixed fees
        client.transfer(&env.current_contract_address(), &admin, &ADMIN_FEE);
        client.transfer(&env.current_contract_address(), &loan.coop, &COOP_FEE);

        // Return Principal back to the Cooperative's Pool inside the contract
        let mut balance: i128 = env.storage().persistent().get(&DataKey::Pool(loan.coop.clone())).unwrap_or(0);
        balance += loan.principal;
        env.storage().persistent().set(&DataKey::Pool(loan.coop), &balance);

        // Clear the loan
        env.storage().persistent().remove(&DataKey::Loan(driver));
    }
}