import { Request, Response } from "express";
import { ethers } from "ethers";
import {
  apiUrl,
  chainRPC,
  dexContract,
  erc20ABI,
  watchTowerVerificationPath,
} from "../configs";
import BN from "bignumber.js";
import axios from "axios";
import { signData } from "../services";
import { matchedData, validationResult } from "express-validator";

export async function post(
  req: Request<
    any,
    any,
    {
      chainId: keyof typeof chainRPC;
      token: string;
      orders: { address: string; amount: string }[];
    }
  >,
  res: Response,
  next: Function
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  const data = matchedData(req);
  const rpc = chainRPC[<keyof typeof chainRPC>data.chainId];
  const dexAddress = dexContract[<keyof typeof chainRPC>data.chainId];
  const provider = new ethers.JsonRpcProvider(rpc);
  const erc20 = new ethers.Contract(data.token, erc20ABI, provider);

  let faultyOrders: { [key in string]: string } = {};
  let balancesPromises: Promise<string>[] = [];
  let allowancesPromises: Promise<string>[] = [];
  let balances: string[] = [];
  let allowances: string[] = [];

  try {
    data.orders.forEach((order: { address: string; amount: string }) => {
      balancesPromises.push(erc20.balanceOf(order.address));
      allowancesPromises.push(erc20.allowance(order.address, dexAddress));
    });
    [balances, allowances] = await Promise.all([
      Promise.all(balancesPromises),
      Promise.all(allowancesPromises),
    ]);
  } catch (e: any) {
    console.log(
      "An error occured during balances retrieval from the blockchain"
    );
    res.status(400).json({
      errors: "An error occured during balances retrieval from the blockchain",
    });
    return;
  }

  for (let i = 0; i < balances.length; ++i) {
    const balance = BN(balances[i]);
    const allowance = BN(allowances[i]);
    const amount = BN(data.orders[i].amount);
    if (balance.lt(amount) || allowance.lt(amount)) {
      faultyOrders[data.orders[i].address] = BN.min(balance, allowance).toFixed();
    }
  }

  if (Object.values(faultyOrders).length)
    await axios.post(
      apiUrl + watchTowerVerificationPath,
      signData({ orders: faultyOrders, token: data.token })
    );
  res.json(faultyOrders);
}
