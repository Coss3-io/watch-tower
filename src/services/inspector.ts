import { ethers } from "ethers";
import {
  apiUrl,
  chainRPC,
  dexABI,
  dexContract,
  genesisBlock,
  stackingABI,
  stackingContract,
  stackingFeesPath,
  stackingFeesWithdrawalPath,
  stackingPath,
  watchTowerPath,
} from "../configs";
import { promises as fs } from "fs";
import axios from "axios";

/**
 * @notice Class used to inspect the blockchain events and send the data to the api
 */
export class Inspector {
  private tradeLock = false;
  private stackLock = false;
  private provider;
  private dexContract;
  private stackingContract;

  constructor(private chainId: string) {
    const rpc = chainRPC[<keyof typeof chainRPC>this.chainId];
    const dexAddress = dexContract[<keyof typeof chainRPC>this.chainId];
    const stackingAddress =
      stackingContract[<keyof typeof chainRPC>this.chainId];
    this.provider = new ethers.JsonRpcProvider(rpc);
    this.dexContract = new ethers.Contract(dexAddress, dexABI, this.provider);
    this.stackingContract = new ethers.Contract(
      dexAddress,
      stackingABI,
      this.provider
    );
  }

  /**
   * @notice - Used to analayse the trade related event and send the data back to the API
   * @returns void
   */
  public async tradeAnalysis(): Promise<void> {
    if (this.tradeLock) return;
    this.tradeLock = true;
    try {
      const block = await this.getLastBlock("trade");
      const lastBlock = Math.min(
        Number((await this.provider.getBlock("latest"))?.number),
        block + 4000
      );

      const [tradeEvents, cancelEvents] = await Promise.all([
        this.dexContract.queryFilter("NewTrade", block, lastBlock),
        this.dexContract.queryFilter("Cancel", block, lastBlock),
      ]);

      tradeEvents.forEach(async (tradeEvent) => {
        if ("args" in tradeEvent) {
          await axios.post(apiUrl + watchTowerPath, {
            taker: tradeEvent.args[0],
            block: tradeEvent.blockNumber,
            trades: {
              [tradeEvent.args[1]]: {
                amount: tradeEvent.args[2],
                fees: tradeEvent.args[3],
                base_fees: tradeEvent.args[4],
                is_buyer: !tradeEvent.args[5],
              },
            },
          });
        }
      });

      cancelEvents.forEach(async (cancelEvent) => {
        if ("args" in cancelEvent) {
          await axios.delete(apiUrl + watchTowerPath, {
            data: { orderHash: cancelEvent.args[0] },
          });
        }
      });
      await this.saveLastBlock(lastBlock, "trade");
    } catch (e: any) {
      console.log(
        `${new Date().toISOString()}: An error occured while trying to fetch the trade details ${e}`
      );
    }

    this.tradeLock = false;
  }

  /**
   * @notice - Used to analayse the stacking related event and send the data back to the API
   * @returns void
   */
  public async stackingAnalysis(): Promise<void> {
    if (this.stackLock) return;
    this.stackLock = true;
    try {
      const block = await this.getLastBlock("stacking");
      const lastBlock = Math.min(
        Number((await this.provider.getBlock("latest"))?.number),
        block + 4000
      );

      const [
        stackingDepositEvents,
        stackingWithdrawalEvents,
        feesDepositEvents,
        feesWithdrawalEvents,
      ] = await Promise.all([
        this.stackingContract.queryFilter("NewStackDeposit", block, lastBlock),
        this.stackingContract.queryFilter(
          "NewStackWithdrawal",
          block,
          lastBlock
        ),
        this.stackingContract.queryFilter("NewFeesDeposit", block, lastBlock),
        this.stackingContract.queryFilter(
          "NewFeesWithdrawal",
          block,
          lastBlock
        ),
      ]);

      stackingDepositEvents.forEach(async (depositEvent) => {
        if ("args" in depositEvent) {
          await axios.post(apiUrl + stackingPath, {
            address: depositEvent.args[2],
            withdraw: false,
            amount: depositEvent.args[1],
            slot: depositEvent.args[0],
            chain_id: parseInt(this.chainId),
          });
        }
      });

      stackingWithdrawalEvents.forEach(async (withdrawEvent) => {
        if ("args" in withdrawEvent) {
          await axios.post(apiUrl + stackingPath, {
            address: withdrawEvent.args[2],
            withdraw: true,
            amount: withdrawEvent.args[1],
            slot: withdrawEvent.args[0],
            chain_id: parseInt(this.chainId),
          });
        }
      });

      feesDepositEvents.forEach(async (feeDepositEvent) => {
        if ("args" in feeDepositEvent) {
          await axios.post(apiUrl + stackingFeesPath, {
            slot: feeDepositEvent.args[0],
            token: feeDepositEvent.args[2],
            amount: feeDepositEvent.args[1],
            chain_id: parseInt(this.chainId),
          });
        }
      });

      feesWithdrawalEvents.forEach(async (feesWithdrawalEvent) => {
        if ("args" in feesWithdrawalEvent) {
          feesWithdrawalEvent.args[2].forEach(async (token: string) => {
            await axios.post(apiUrl + stackingFeesWithdrawalPath, {
              slot: feesWithdrawalEvent.args[0],
              address: feesWithdrawalEvent.args[1],
              token: token,
              chain_id: parseInt(this.chainId),
            });
          });
        }
      });
      await this.saveLastBlock(lastBlock, "stacking");
    } catch (e: any) {
      console.error(
        `${new Date().toISOString()}: An error occured while trying to fetch the stacking details ${e}`
      );
    }

    this.stackLock = false;
  }

  /**
   * @notice - Used to retrieve the last analyzed block from the file
   * @param name - the name of the section to get the last block from file (trade or stacking)
   * @returns 
   */
  private async getLastBlock(name: string): Promise<number> {
    try {
      return Number(
        await fs.readFile(`blocks/${name}/${this.chainId}.txt`, "utf8")
      );
    } catch (e: any) {
      return genesisBlock[<keyof typeof chainRPC>this.chainId];
    }
  }

  /**
   * @notice - Function used to save the last block on the save file
   * @param block - The number of the last block analysed
   * @param name - The name of the section to save the block to (stacking or trade)
   */
  private async saveLastBlock(block: number, name: string): Promise<void> {
    try {
      await fs.writeFile(`blocks/${name}/${this.chainId}.txt`, String(block));
    } catch (e: any) {
      console.error(
        `${new Date().toISOString()}: An error occured while trying to write the new block ${e}`
      );
    }
  }
}
