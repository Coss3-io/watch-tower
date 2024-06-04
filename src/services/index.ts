import { createHmac } from "crypto";
import { ethers } from "ethers";
import { APIKEY } from "../configs";
import { WRONG_ORDERS } from "../configs/messages";

export function verifyBalances(
  order: { address: string; amount: number }[],
  token: string,
  chainId: number
): { address: string; amount: number }[] {
  return [];
}

export function validateAddress(address: string): boolean {
  try {
    !!ethers.getAddress(address.toLowerCase());
    return true;
  } catch (e: any) {
    throw new Error("Wrong address sent");
  }
}
export function validateOrders(orders: Array<any>): boolean {
  if (!orders || !orders.length) return false;

  orders.forEach((order) => {
    if (typeof order !== "object") {
      throw new Error("Wrong order format");
    } else {
      if (!order.amount) {
        throw new Error(WRONG_ORDERS);
      } else if (!order.address) {
        throw new Error(WRONG_ORDERS);
      }

      validateAddress(order.address);
      if (!parseInt(order.amount)) {
        throw new Error(WRONG_ORDERS);
      }
    }
  });
  return true;
}

export function signData(data: object) {
  const hmac = createHmac("sha256", APIKEY);
  const time = Math.floor(Date.now());

  const timestampedData = { ...data, timestamp: time };
  hmac.update(
    JSON.stringify(timestampedData).split(":").join(": ").split(",").join(", ")
  );
  return { signature: hmac.digest("hex"), ...timestampedData };
}
