import { createHmac } from "crypto";
import { ethers } from "ethers";
import { APIKEY } from "../configs";

export function verifyBalances(
  order: { address: string; amount: number }[],
  token: string,
  chainId: number
): { address: string; amount: number }[] {
  return [];
}

export function validateAddress(address: string): boolean {
  return !!ethers.getAddress(address.toLowerCase());
}

export function validateOrders(orders: Array<any>): boolean {
  orders.forEach((order) => {
    if (typeof order !== "object") {
      throw new Error("Wrong order format");
    } else {
      if (!order.amount) {
        throw new Error("Missing an order amount");
      } else if (!order.token) {
        throw new Error("Missing an order token");
      }

      validateAddress(order.token);
      parseInt(order.amount);
    }
  });
  return true;
}

export function signData(data: object) {
  const hmac = createHmac("sha256", APIKEY);
  const time = Math.floor(Date.now() / 1000);

  const timestampedData = { ...data, timestamp: time };
  hmac.update(JSON.stringify(data));
  return { signature: hmac.digest("hex"), ...timestampedData };
}
