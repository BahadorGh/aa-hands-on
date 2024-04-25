require("dotenv").config();
import React, { useState, useEffect } from "react";
import { polygonAmoy } from "viem/chains";
import { ethers } from "ethers";
import {
  createWalletClient,
  encodeFunctionData,
  parseAbi,
  custom,
  http,
  fallback,
} from "viem";
import { createSmartAccountClient, PaymasterMode } from "@biconomy/account";
import "./App.css";

// This has to be the USDT address on your desired chain(currently I just deployed a mockTether contract)
const usdt = "0x5943cBb5b0f88C0a8aD599e81d6eb593e1443Aac";

const parsedAbi = parseAbi([
  "function approve(address _from,uint256 amount)",
  "function transfer(address _from,uint256 amount)",
]);

function App() {
  const [eoaAccountAddress, setEoaAccountAddress] = useState(null);
  const [SmartAccountAddress, setSmartAccountAddress] = useState(null);
  const [smartAccount, setSmartAccount] = useState(null);
  const [smartAccountBalance, setSmartAccountBalance] = useState(null);
  const [theClient, setTheClient] = useState(null);
  const [recipient, setRecipient] = useState(null);
  const [transferAmount, setTransferAmount] = useState(null);
  const [commissionWallet, setCommissionWallet] = useState(null);
  const [transferAmountCommission, setTransferAmountCommission] =
    useState(null);

  //#region backend in case you want to interact from backend
  // For connecting in backend
  // const backend = privateKeyToAccount("your private key");

  // const client_backend = createWalletClient({
  //   account: backend,
  //   chain: polygonAmoy,
  //   transport: fallback([http("rpc1"), http("rpc2")]),
  // });

  // const smartAccount_backend = await createSmartAccountClient({
  //   signer: client_backend,
  //   bundlerUrl: process.env.BUNDLER_URL,
  //   biconomyPaymasterApiKey: process.env.PAYMASTER_API_Key,
  // });
  //#endregion

  useEffect(() => {
    // Connecting to the user browser wallet
    //  Then creating the smart wallet instance
    //   to be used in send transaction part
    const connectWalletAndGenerateSWInstance = async () => {
      try {
        // For connecting in frontend
        const [address] = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        const client = createWalletClient({
          account: address,
          chain: polygonAmoy,
          transport: custom(window.ethereum),
        });

        const eoa = client.account.address;
        console.log(`EOA address: ${eoa}`);

        const smartAccount = await createSmartAccountClient({
          signer: client,
          bundlerUrl: process.env.BUNDLER_URL,
          biconomyPaymasterApiKey: process.env.PAYMASTER_API_Key,
        });

        console.log("smartAccount::", smartAccount);

        const userOpReceiptMaxDurationIntervals = {
          [80002]: 60000,
        };

        const saAddress = await smartAccount.getAccountAddress();
        console.log(`Smart wallet address: ${saAddress}`);

        setEoaAccountAddress(eoa);
        setTheClient(client);
        setSmartAccount(smartAccount);
        setSmartAccountAddress(saAddress);
      } catch (err) {
        console.error(err);
      }
    };
    connectWalletAndGenerateSWInstance();
  }, []);

  // Create USDT withdrawal transaction data
  // Usable for user to withdrawing his smart contract wallet's funds(in our case, USDT)
  const withdrawBalance = async (withdrawAddress, withdrawalAmt) => {
    const approveWithdraw = encodeFunctionData({
      abi: parsedAbi,
      functionName: "approve",
      args: [withdrawAddress, withdrawalAmt],
    });

    const makeWithdraw = encodeFunctionData({
      abi: parsedAbi,
      functionName: "transfer",
      args: [withdrawAddress, withdrawalAmt],
    });

    const withdrawApproval = {
      to: usdt,
      data: approveWithdraw,
    };

    const withdrawAmount = {
      to: usdt,
      data: makeWithdraw,
    };

    // Batching our desired transactions
    const fullWithdrawal = [withdrawApproval, withdrawAmount];

    const userOpResponse = await smartAccount.sendTransaction(fullWithdrawal, {
      paymasterServiceData: {
        mode: PaymasterMode.SPONSORED,
      },
    });

    const { transactionHash } = await userOpResponse.waitForTxHash();
    console.log("transactionHash", transactionHash);

    const userOpReceipt = await userOpResponse.wait();

    if (userOpReceipt.success == "true") {
      console.log("UserOp receipt", userOpReceipt);
      console.log("Transaction receipt", userOpReceipt.receipt);
    }
  };

  const calculateTxFee = async (tx1, tx2, tx3, tx4) => {
    // Building the userOp object based on the transactions the user wants to happen
    const userOp = await smartAccount.buildUserOp([tx1, tx2, tx3, tx4], {
      // We use SPONSORED mode here, to make sponsorship for the user tx
      paymasterServiceData: {
        mode: PaymasterMode.SPONSORED,
      },
    });
    console.log("userOp:::", userOp);

    // The transaction gas fees, can be approximately calculated by:
    //  preVerificationGas + verificationGasLimit
    const pvg = Number(userOp.preVerificationGas);
    const vgl = userOp.verificationGasLimit;
    const totalEstimatedGas = pvg + vgl;
    console.log("pvg:::", typeof pvg);
    console.log("vgl:::", typeof vgl);
    console.log(pvg + vgl);
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

    // Getting current block gas price
    const currentGasPrice = (await provider.getFeeData()).gasPrice;

    // Calculating transaction fee: gasPrice * AA gas
    const EstimatedTransactionFee = currentGasPrice * totalEstimatedGas;
    const EstimatedTransactionFeeFormatted = ethers.BigNumber.from(
      EstimatedTransactionFee.toString()
    );
    console.log("txGasFee::", currentGasPrice);
    console.log("Estimated transaction fee:", EstimatedTransactionFee);
    console.log(
      `Estimated transaction fee formatted:${ethers.utils.formatEther(
        EstimatedTransactionFeeFormatted
      )} matic`
    );
  };

  const checkBalance = async (smartWallet) => {
    // Setting up the RPC provider
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

    // ABI of the balanceOf function
    const abi = [
      {
        inputs: [
          {
            internalType: "address",
            name: "account",
            type: "address",
          },
        ],
        name: "balanceOf",
        outputs: [
          {
            internalType: "uint256",
            name: "",
            type: "uint256",
          },
        ],
        stateMutability: "view",
        type: "function",
      },
    ];

    // Making an instance of our mockUSDT contract
    const contract = new ethers.Contract(usdt, abi, provider);

    // Reading user's balance
    const userBalance = await contract.balanceOf(smartWallet);

    console.log(
      `${smartWallet} has ${ethers.utils.parseUnits(
        userBalance.toString()
      )} usdt`
    );

    // Setting balance as a state
    setSmartAccountBalance(userBalance);
    return userBalance;
  };

  const sendTx = async (to, amount, commissionWallet, commissionAmount) => {
    // This has to be the USDT address on your desired chain(currently I just deployed a mockTether contract)
    const usdt = process.env.MOCK_USDT_ADDRESS;

    const parsedAbi = parseAbi([
      "function approve(address _from,uint256 amount)",
      "function transfer(address _from,uint256 amount)",
    ]);
    try {
      // Here we convert the amount into the acceptable format,
      //   based on USDT token decimals value(6)
      const transferToAmount = ethers.utils.parseUnits(amount.toString(), 6);
      const transferToCommission = ethers.utils.parseUnits(
        commissionAmount.toString(),
        6
      );
      const totalTransferringAmount = transferToAmount + transferToCommission;

      // Generating data to be send to the contract
      const approveUSDT = encodeFunctionData({
        abi: parsedAbi,
        functionName: "approve",
        args: [commissionWallet, transferToCommission],
      });
      const transferUSDT = encodeFunctionData({
        abi: parsedAbi,
        functionName: "transfer",
        args: [commissionWallet, transferToCommission],
      });

      const approveRecipientUSDT = encodeFunctionData({
        abi: parsedAbi,
        functionName: "approve",
        args: [to, transferToAmount],
      });
      const transferRecipientUSDT = encodeFunctionData({
        abi: parsedAbi,
        functionName: "transfer",
        args: [to, transferToAmount],
      });

      // Summing up the transaction data(to address, data to be send to the contract)
      const tx1 = {
        to: usdt,
        data: approveUSDT,
      };
      const tx2 = {
        to: usdt,
        data: transferUSDT,
      };
      const tx3 = {
        to: usdt,
        data: approveRecipientUSDT,
      };
      const tx4 = {
        to: usdt,
        data: transferRecipientUSDT,
      };

      // Batching our desired transactions
      const txs = [tx1, tx2, tx3, tx4];

      // Checking our batch tranasctions totall gas fees(for example to show the user)
      const txFee = await calculateTxFee(tx1, tx2, tx3, tx4);

      // Checking the user's smart wallet balance
      const userSmartWalletBalance = await checkBalance(SmartAccountAddress);

      if (userSmartWalletBalance < totalTransferringAmount)
        throw `Not enough USDT balance. Please charge your smart contract wallet at ${SmartAccountAddress}`;

      // Sending batch transactions to the bundler, with the SPONSORED MODE
      // In SPONSORED MODE, the network gas fees,
      //  will be deducted from your deposited amount(in our case, matic),
      //    into the paymaster of the biconomy
      //      https://dashboard.biconomy.io
      const userOpResponse = await smartAccount.sendTransaction(txs, {
        paymasterServiceData: {
          mode: PaymasterMode.SPONSORED,
        },
      });

      // Waiting for the transaction to get mined on the chain
      const { transactionHash } = await userOpResponse.waitForTxHash();
      console.log("transactionHash", transactionHash);

      const userOpReceipt = await userOpResponse.wait();

      if (userOpReceipt.success == "true") {
        console.log("UserOp receipt", userOpReceipt);
        console.log("Transaction receipt", userOpReceipt.receipt);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div>
        <h1> Smart Accounts + Gasless Transactions</h1>

        <p>
          <b>First</b> connect your wallet <br />
          <b>Then</b> press send button
        </p>
      </div>

      <div method="post" className="field_form">
        <div className="row">
          <label htmlFor="transferAmtComm">
            Transfer amount - commission:{" "}
          </label>
          <input
            type="number"
            required="required"
            placeholder="1"
            id="transferAmtComm"
            min={1}
            className="form-control"
            onChange={(e) => setTransferAmountCommission(e.target.value)}
          />

          <label htmlFor="transferComm"> Transfer to - commission: </label>
          <input
            type="string"
            required="required"
            placeholder="0x..."
            id="transferComm"
            className="form-control"
            onChange={(e) => setCommissionWallet(e.target.value)}
          />
        </div>
        <div className="row">
          <label htmlFor="transferAmt">Transfer amount - main: </label>
          <input
            type="number"
            required="required"
            placeholder="1"
            id="transferAmt"
            min={1}
            className="form-control"
            onChange={(e) => setTransferAmount(e.target.value)}
          />

          <label htmlFor="transferDest">Transfer to - main: </label>
          <input
            type="string"
            required="required"
            placeholder="0x..."
            id="transferDest"
            className="form-control"
            onChange={(e) => setRecipient(e.target.value)}
          />
        </div>
      </div>

      <button
        onClick={() =>
          sendTx(
            recipient,
            transferAmount,
            commissionWallet,
            transferAmountCommission
          )
        }
      >
        Send the tx
      </button>
    </>
  );
}

export default App;
