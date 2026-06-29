import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext"; // 1. Import your hook
import UserLayout from "../../components/layout/UserLayout";

const UserVault = () => {
  const { userData, loading: authLoading } = useAuth(); // 2. Consume shared auth data
  const [balance, setBalance] = useState("...");

  useEffect(() => {
    // Only run if the auth state is done loading and we have a valid public key
    if (authLoading || !userData?.publicKey) {
      if (userData && !userData.publicKey) setBalance("0.00");
      return;
    }

    const networkUrl = userData.network === "PUBLIC"
      ? "https://horizon.stellar.org"
      : "https://horizon-testnet.stellar.org";

    fetch(`${networkUrl}/accounts/${userData.publicKey}`)
      .then(res => res.json())
      .then(resData => {
        if (resData.balances) {
          const xlm = resData.balances.find((b: any) => b.asset_type === 'native');
          setBalance(xlm ? parseFloat(xlm.balance).toFixed(2) : "0.00");
        } else {
          setBalance("0.00");
        }
      })
      .catch(() => setBalance("0.00"));
  }, [userData, authLoading]); // 3. Re-run when userData changes

  if (authLoading) {
    return <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>Syncing Workspace...</div>;
  }

  // ... your remaining TSX layout can stay exactly the same