import varint from 'varint';
import * as net from 'net';

export function encodeString(value: string): Buffer {
    const stringBytes = Buffer.from(value, 'utf-8');
    const length = stringBytes.length;
    return Buffer.concat([Buffer.from(varint.encode(length)), stringBytes]);
}

export function createHandshakePacket(protocolVersion: number, serverAddress: string, serverPort: number, nextState: number): Buffer {
    const packetId = 0x00;
    let packet = Buffer.alloc(0);

    packet = Buffer.concat([packet, Buffer.from(varint.encode(packetId))]);
    packet = Buffer.concat([packet, Buffer.from(varint.encode(protocolVersion))]);
    packet = Buffer.concat([packet, encodeString(serverAddress)]);
    packet = Buffer.concat([packet, Buffer.from([(serverPort >> 8) & 0xFF, serverPort & 0xFF])]);
    packet = Buffer.concat([packet, Buffer.from(varint.encode(nextState))]);

    return packet;
}

export function createStatusRequestPacket(): Buffer {
    const packetId = 0x00;
    return Buffer.from(varint.encode(packetId));
}

function decodeVarInt(buffer: Buffer, offset: number): { value: number, bytes: number } {
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

function sanitizeJsonData(data: string): string {
    // Remove any characters before the first '{'
    let jsonData = data.replace(/^[^\{]*/, '');

    // Ensure proper JSON structure
    try {
        // Try parsing to verify if the data is valid JSON
        JSON.parse(jsonData);
    } catch {
        // If parsing fails, strip out any trailing unwanted characters
        // This can handle cases where trailing data might be present
        jsonData = jsonData.replace(/[\s\S]*\{/, '{'); // Keep only content starting from the first '{'
    }

    return jsonData;
}

export function getServerStatus(serverAddress: string, serverPort: number): Promise<any> {
    return new Promise((resolve, reject) => {
        const client = net.connect(serverPort, serverAddress, () => {
            const handshakePacket = createHandshakePacket(754, serverAddress, serverPort, 1); // Protocol version 754 as placeholder
            const statusRequestPacket = createStatusRequestPacket();
            client.write(Buffer.concat([Buffer.from(varint.encode(handshakePacket.length)), handshakePacket]));
            client.write(Buffer.concat([Buffer.from(varint.encode(statusRequestPacket.length)), statusRequestPacket]));
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
                } catch (e) {
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
