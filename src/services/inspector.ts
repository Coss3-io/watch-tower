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
import BigNumber from "bignumber.js";
import { signData } from ".";

/**
 * @notice Class used to inspect the blockchain events and send the data to the api
 */
export class Inspector {
  private _tradeLock = false;
  private _stackLock = false;
  private _provider;
  private _dexContract;
  private _stackingContract;

  constructor(private chainId: string) {
    const rpc = chainRPC[<keyof typeof chainRPC>this.chainId];
    const dexAddress = dexContract[<keyof typeof chainRPC>this.chainId];
    const stackingAddress =
      stackingContract[<keyof typeof chainRPC>this.chainId];
    this._provider = new ethers.JsonRpcProvider(rpc);
    this._dexContract = new ethers.Contract(dexAddress, dexABI, this.provider);
    this._stackingContract = new ethers.Contract(
      stackingAddress,
      stackingABI,
      this.provider
    );
  }

  public get provider() {
    return this._provider;
  }

  public get dexContract() {
    return this._dexContract;
  }

  public get stackingContract() {
    return this._stackingContract;
  }

  /**
   * @notice - Used to analayse the trade related event and send the data back to the API
   * @returns void
   */
  public async tradeAnalysis(): Promise<boolean> {
    if (this._tradeLock) return false;
    this._tradeLock = true;
    const errors: Object[] = [];
    try {
      const block = await this.getLastBlock("trade");
      const lastBlock = Math.min(
        Number((await this.provider.getBlock("latest"))?.number),
        block + 4000
      );

      if (block == lastBlock) {
        this._tradeLock = false;
        return true;
      }

      const [tradeEvents, cancelEvents] = await Promise.all([
        this._dexContract.queryFilter("NewTrade", block + 1, lastBlock),
        this._dexContract.queryFilter("Cancel", block + 1, lastBlock),
      ]);

      const trades = tradeEvents.map(async (tradeEvent) => {
        console.log(tradeEvent);
        if ("args" in tradeEvent) {
          const data = signData({
            taker: tradeEvent.args[0],
            block: tradeEvent.blockNumber,
            trades: {
              ["0x" +
              new BigNumber(tradeEvent.args[1]).toString(16).padStart(64, "0")]:
                {
                  amount: new BigNumber(tradeEvent.args[2]).toFixed(),
                  fees: new BigNumber(tradeEvent.args[3]).toFixed(),
                  base_fees: tradeEvent.args[4],
                  is_buyer: parseInt(tradeEvent.args[5]) == 0,
                },
            },
          });
          console.log(data);
          const path = apiUrl + watchTowerPath;
          const response = await axios.post(path, data);
          console.log(response.data);
          if (response.status != axios.HttpStatusCode.Ok) {
            errors.push({
              path: path,
              method: "post",
              chain_id: this.chainId,
              ...data,
            });
          }
        }
      });

      const cancel = cancelEvents.map(async (cancelEvent) => {
        if ("args" in cancelEvent) {
          const data = {
            orderHash:
              "0x" +
              new BigNumber(cancelEvent.args[0]).toString(16).padStart(64, "0"),
            baseToken: cancelEvent.args[1],
            quoteToken: cancelEvent.args[2],
          };
          const path = apiUrl + watchTowerPath;
          const response = await axios.delete(apiUrl + watchTowerPath, {
            data: signData(data),
          });

          if (response.status != axios.HttpStatusCode.Ok) {
            errors.push({
              path: path,
              method: "delete",
              chain_id: this.chainId,
              ...data,
            });
          }
        }
      });
      await Promise.all(trades);
      await Promise.all(cancel);
      await this.saveLastBlock(lastBlock, "trade");
    } catch (e: any) {
      console.error(
        `${new Date().toISOString()}: An error occured while trying to fetch the trade details ${e}`
      );
    } finally {
      await this.writeErrors(errors, "trade");
    }
    this._tradeLock = false;
    return true;
  }

  /**
   * @notice - Used to analayse the stacking related event and send the data back to the API
   * @returns void
   */
  public async stackingAnalysis(): Promise<boolean> {
    if (this._stackLock) return false;
    this._stackLock = true;
    const errors: Object[] = [];
    try {
      const block = await this.getLastBlock("stacking");
      const lastBlock = Math.min(
        Number((await this.provider.getBlock("latest"))?.number),
        block + 4000
      );

      if (block == lastBlock) return true;

      const [
        stackingDepositEvents,
        stackingWithdrawalEvents,
        feesDepositEvents,
        feesWithdrawalEvents,
      ] = await Promise.all([
        this._stackingContract.queryFilter("NewStackDeposit", block, lastBlock),
        this._stackingContract.queryFilter(
          "NewStackWithdrawal",
          block,
          lastBlock
        ),
        this._stackingContract.queryFilter("NewFeesDeposit", block, lastBlock),
        this._stackingContract.queryFilter(
          "NewFeesWithdrawal",
          block,
          lastBlock
        ),
      ]);

      const stackingDeposit = stackingDepositEvents.map(
        async (depositEvent) => {
          if ("args" in depositEvent) {
            const path = apiUrl + stackingPath;
            const data = signData({
              address: depositEvent.args[2],
              amount: new BigNumber(depositEvent.args[1]).toFixed(),
              slot: new BigNumber(depositEvent.args[0]).toFixed(),
              chain_id: parseInt(this.chainId),
              withdraw: false,
            });

            const response = await axios.post(path, data);
            if (response.status != axios.HttpStatusCode.Ok) {
              errors.push({
                path: path,
                method: "post",
                ...data,
              });
            }
          }
        }
      );

      const stackingWithdrawal = stackingWithdrawalEvents.map(
        async (withdrawEvent) => {
          if ("args" in withdrawEvent) {
            const path = apiUrl + stackingPath;
            const data = signData({
              address: withdrawEvent.args[2],
              amount: new BigNumber(withdrawEvent.args[1]).toFixed(),
              slot: new BigNumber(withdrawEvent.args[0]).toFixed(),
              chain_id: parseInt(this.chainId),
              withdraw: true,
            });

            const response = await axios.post(path, data);
            if (response.status != axios.HttpStatusCode.Ok) {
              errors.push({
                path: path,
                method: "post",
                ...data,
              });
            }
          }
        }
      );

      const feesDeposit = feesDepositEvents.map(async (feeDepositEvent) => {
        if ("args" in feeDepositEvent) {
          const path = apiUrl + stackingFeesPath;
          const data = signData({
            token: feeDepositEvent.args[2],
            amount: new BigNumber(feeDepositEvent.args[1]).toFixed(),
            slot: new BigNumber(feeDepositEvent.args[0]).toFixed(),
            chain_id: parseInt(this.chainId),
          });
          const response = await axios.post(path, data);
          if (response.status != axios.HttpStatusCode.Ok) {
            errors.push({
              path: path,
              method: "post",
              ...data,
            });
          }
        }
      });

      const feesWithdrawal = feesWithdrawalEvents.map(
        async (feesWithdrawalEvent) => {
          if ("args" in feesWithdrawalEvent) {
            feesWithdrawalEvent.args[2].forEach(async (token: string) => {
              const path = apiUrl + stackingFeesWithdrawalPath;
              const data = signData({
                address: feesWithdrawalEvent.args[1],
                token: token,
                slot: new BigNumber(feesWithdrawalEvent.args[0]).toFixed(),
                chain_id: parseInt(this.chainId),
              });

              const response = await axios.post(path, data);
              if (response.status != axios.HttpStatusCode.Ok) {
                errors.push({
                  path: path,
                  method: "post",
                  ...data,
                });
              }
            });
          }
        }
      );
      await Promise.all(stackingDeposit);
      await Promise.all(stackingWithdrawal);
      await Promise.all(feesDeposit);
      await Promise.all(feesWithdrawal);
      await this.saveLastBlock(lastBlock, "stacking");
    } catch (e: any) {
      console.error(
        `${new Date().toISOString()}: An error occured while trying to fetch the stacking details ${e}`
      );
    }
    await this.writeErrors(errors, "stacking");
    this._stackLock = false;
    return true;
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

  /**
   * @notice - Used to log the failed request to the API in order to manually create them
   * @param errors - The array of the errors that happened
   * @param name - The of the type of the errors trade or stacking
   */
  private async writeErrors(errors: Object[], name: string): Promise<void> {
    if (!errors || !errors.length) return;
    await fs.appendFile(
      `blocks/${name}/errors.log`,
      JSON.stringify(errors) + "\n"
    );
  }
}
