## [Unreleased]

### Added
- Created a Node.js testing environment for end-to-end WDK and RLN interactions.
- `e2e-payment-flow-wdk-rgb.js` script to automate interactions between the RGB Lightning Node (RLN) via REST API and the WDK RGB Lightning library.
- E2E Test flows for:
  - Basic Lightning Network (LN) payments.
  - On-chain BTC transfers.
  - RGB Asset issuance on RLN and transfer to WDK.
- `README.md` documentation covering prerequisites, architectural principles and execution instructions.
- `package.json` and `.env.example` for dependencies and configuration management.
