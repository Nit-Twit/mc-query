"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeString = encodeString;
exports.createHandshakePacket = createHandshakePacket;
exports.createStatusRequestPacket = createStatusRequestPacket;
exports.getServerStatus = getServerStatus;
const varint_1 = __importDefault(require("varint"));
const net = __importStar(require("net"));
function encodeString(value) {
    const stringBytes = Buffer.from(value, 'utf-8');
    const length = stringBytes.length;
    return Buffer.concat([Buffer.from(varint_1.default.encode(length)), stringBytes]);
}
function createHandshakePacket(protocolVersion, serverAddress, serverPort, nextState) {
    const packetId = 0x00;
    let packet = Buffer.alloc(0);
    packet = Buffer.concat([packet, Buffer.from(varint_1.default.encode(packetId))]);
    packet = Buffer.concat([packet, Buffer.from(varint_1.default.encode(protocolVersion))]);
    packet = Buffer.concat([packet, encodeString(serverAddress)]);
    packet = Buffer.concat([packet, Buffer.from([(serverPort >> 8) & 0xFF, serverPort & 0xFF])]);
    packet = Buffer.concat([packet, Buffer.from(varint_1.default.encode(nextState))]);
    return packet;
}
function createStatusRequestPacket() {
    const packetId = 0x00;
    return Buffer.from(varint_1.default.encode(packetId));
}
function decodeVarInt(buffer, offset) {
    let numRead = 0;
    let result = 0;
    let read;
    do {
        read = buffer[offset + numRead];
        result |= (read & 0x7F) << (7 * numRead);
        numRead++;
        if (numRead > 5) {
            throw new Error('VarInt is too big');
        }
    } while ((read & 0x80) !== 0);
    return { value: result, bytes: numRead };
}
function sanitizeJsonData(data) {
    // Remove any characters before the first '{'
    let jsonData = data.replace(/^[^\{]*/, '');
    // Ensure proper JSON structure
    try {
        // Try parsing to verify if the data is valid JSON
        JSON.parse(jsonData);
    }
    catch (_a) {
        // If parsing fails, strip out any trailing unwanted characters
        // This can handle cases where trailing data might be present
        jsonData = jsonData.replace(/[\s\S]*\{/, '{'); // Keep only content starting from the first '{'
    }
    return jsonData;
}
function getServerStatus(serverAddress, serverPort) {
    return new Promise((resolve, reject) => {
        const client = net.connect(serverPort, serverAddress, () => {
            const handshakePacket = createHandshakePacket(754, serverAddress, serverPort, 1); // Protocol version 754 as placeholder
            const statusRequestPacket = createStatusRequestPacket();
            client.write(Buffer.concat([Buffer.from(varint_1.default.encode(handshakePacket.length)), handshakePacket]));
            client.write(Buffer.concat([Buffer.from(varint_1.default.encode(statusRequestPacket.length)), statusRequestPacket]));
        });
        let receivedData = Buffer.alloc(0);
        client.on('data', (data) => {
            receivedData = Buffer.concat([receivedData, data]);
            while (receivedData.length > 0) {
                // Decode the length of the packet
                let offset = 0;
                const lengthInfo = decodeVarInt(receivedData, offset);
                const packetLength = lengthInfo.value;
                offset += lengthInfo.bytes;
                if (receivedData.length < packetLength + offset) {
                    // Not enough data yet
                    break;
                }
                // Extract and sanitize the JSON data
                const jsonData = receivedData.slice(offset + 1, offset + packetLength).toString('utf-8');
                // Sanitize the JSON data
                const sanitizedData = sanitizeJsonData(jsonData);
                try {
                    const status = JSON.parse(sanitizedData);
                    resolve(status);
                }
                catch (e) {
                    console.error('Failed to parse JSON:', sanitizedData);
                    reject(e);
                }
                // Remove the processed data
                receivedData = receivedData.slice(offset + packetLength);
            }
        });
        client.on('error', (error) => {
            reject(error);
        });
    });
}
