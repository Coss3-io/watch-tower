export const apiUrl = "";
export const APIKEY = ""

export const chainRPC = {
  "56": "https://binance.llamarpc.com",
};

export const ecr20ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint amount)",
];
