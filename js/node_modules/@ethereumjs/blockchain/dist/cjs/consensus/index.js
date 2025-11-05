"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthashConsensus = exports.CliqueConsensus = exports.CasperConsensus = void 0;
const casper_ts_1 = require("./casper.js");
Object.defineProperty(exports, "CasperConsensus", { enumerable: true, get: function () { return casper_ts_1.CasperConsensus; } });
const clique_ts_1 = require("./clique.js");
Object.defineProperty(exports, "CliqueConsensus", { enumerable: true, get: function () { return clique_ts_1.CliqueConsensus; } });
const ethash_ts_1 = require("./ethash.js");
Object.defineProperty(exports, "EthashConsensus", { enumerable: true, get: function () { return ethash_ts_1.EthashConsensus; } });
//# sourceMappingURL=index.js.map