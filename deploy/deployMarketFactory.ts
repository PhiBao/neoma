import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFactory = await deploy("MarketFactory", {
    from: deployer,
    log: true,
  });

  console.log(`MarketFactory contract: `, deployedFactory.address);
};

export default func;
func.id = "deploy_marketFactory";
func.tags = ["MarketFactory"];
