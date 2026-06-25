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
- `e2e-payment-flow-wdk-rgb-signet.js` script to automate end-to-end testing on the public UTEXO Signet network.
- `README.signet.md` containing specific documentation, architecture differences, and troubleshooting for the Signet environment.
- `.env.signet.example` providing UTEXO Signet node and LSP configurations.

### Changed
- Updated main `README.md` to include a "Signet Testing" section directing users to the new Signet documentation.

### Fixed
- RGB asset transfer `transport_endpoints` to dynamically use `PROXY_ENDPOINT` instead of hardcoded localhost.
