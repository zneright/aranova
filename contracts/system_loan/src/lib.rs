#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, vec, token, Address, Env, Symbol, Val, IntoVal};

use trust_contract::TrustContractClient;


#[contracttype]
pub enum DataKey {
    Admin,
    TrustContract,
    Loan(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SystemLoanRecord {
    pub principal: i128,
    pub borrower: Address,
    pub interest_rate_bps: i128,
    pub duration_days: u32,
    pub disbursed_at: u64,
    pub is_active: bool,
}

#[contract]
pub struct SystemLoanContract;

#[contractimpl]
impl SystemLoanContract {
    pub fn init(env: Env, admin: Address, trust_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TrustContract, &trust_contract);
    }

    pub fn disburse_loan(
        env: Env, 
        borrower: Address, 
        token: Address, 
        principal: i128, 
        interest_rate_bps: i128, 
        duration_days: u32
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if env.storage().persistent().has(&DataKey::Loan(borrower.clone())) {
            panic!("borrower already has an active system loan");
        }

        let trust_contract_address: Address = env.storage().instance().get(&DataKey::TrustContract).unwrap();
        let trust_client = TrustContractClient::new(&env, &trust_contract_address);
        let trust_score = trust_client.get_trust_score(&borrower);
        if trust_score < 30 {
            panic!("borrower trust score is too low");
        }

        env.storage().persistent().set(
            &DataKey::Loan(borrower.clone()),
            &SystemLoanRecord {
                principal,
                borrower: borrower.clone(),
                interest_rate_bps,
                duration_days,
                disbursed_at: env.ledger().timestamp(),
                is_active: true,
            },
        );

        let client = token::Client::new(&env, &token);
        client.transfer(&admin, &borrower, &principal);

        env.events().publish(
            (Symbol::new(&env, "disburse_system_loan"), borrower),
            (principal, interest_rate_bps, duration_days)
        );
    }

    pub fn repay_loan(env: Env, borrower: Address, token: Address) {
        borrower.require_auth();

        let loan: SystemLoanRecord = env.storage().persistent().get(&DataKey::Loan(borrower.clone()))
            .unwrap_or_else(|| panic!("no active system loan found"));

        if !loan.is_active {
            panic!("loan is not active");
        }

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        let trust_contract_address: Address = env.storage().instance().get(&DataKey::TrustContract).unwrap();

        let interest = (loan.principal * loan.interest_rate_bps * loan.duration_days as i128) / (10_000 * 365);
        let total_due = loan.principal + interest;

        let client = token::Client::new(&env, &token);
        client.transfer(&borrower, &admin, &total_due);

        env.storage().persistent().remove(&DataKey::Loan(borrower.clone()));

        let now = env.ledger().timestamp();
        let due_time = loan.disbursed_at + (loan.duration_days as u64 * 24 * 60 * 60);
        let trust_client = TrustContractClient::new(&env, &trust_contract_address);
        if now <= due_time {
            trust_client.record_event(&borrower, &1);
        } else {
            trust_client.record_event(&borrower, &4);
        }

        trust_client.record_event(&borrower, &3);

        env.events().publish(
            (Symbol::new(&env, "repay_system_loan"), borrower),
            (loan.principal, interest)
        );
    }

    pub fn repay_loan_partial(env: Env, borrower: Address, token: Address, amount: i128) {
        borrower.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let mut loan: SystemLoanRecord = env.storage().persistent().get(&DataKey::Loan(borrower.clone()))
            .unwrap_or_else(|| panic!("no active system loan found"));

        if amount >= loan.principal {
            Self::repay_loan(env, borrower, token);
            return;
        }

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        let client = token::Client::new(&env, &token);
        client.transfer(&borrower, &admin, &amount);

        loan.principal -= amount;
        env.storage().persistent().set(&DataKey::Loan(borrower.clone()), &loan);

        env.events().publish(
            (Symbol::new(&env, "repay_system_loan_partial"), borrower),
            amount
        );
    }

    pub fn get_loan(env: Env, borrower: Address) -> Option<SystemLoanRecord> {
        env.storage().persistent().get(&DataKey::Loan(borrower))
    }
}

#[cfg(test)]
mod test;

