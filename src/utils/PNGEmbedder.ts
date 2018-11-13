declare var Zlib:any;



export class PNGEmbedder {

    private static readonly CHUNK_TYPE:string = "hvDc";
    private static readonly CHUNK_TYPE_BARRAY = new TextEncoder().encode(PNGEmbedder.CHUNK_TYPE);

    constructor() {}

    public embed(pngDataURL:string, bytearray:Uint8Array, handler:(embeddedPngDataURL:string)=>void){
        // Base64 デコード
        var decoded = window.atob(pngDataURL.split(',', 2).pop());
        // Uint8Array に変換
        var png:Uint8Array = new Uint8Array(
            decoded.split('').map(function(char) {
                return char.charCodeAt(0);
            })
        );
		var rpos:number = 0;
		
        // 書き込み用バッファ
        var embeddedPng = new Uint8Array(png.length + bytearray.length + 12);
        var Signature = String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10);
        if (String.fromCharCode.apply(null, png.subarray(rpos, rpos += 8)) !== Signature) {
            throw new Error('invalid signature');
        }
    
        var createChunk = (data:any)=>{
            var dataLength = data.length;
            var chunk = new Uint8Array(4 + 4 + dataLength + 4);
            var type = PNGEmbedder.CHUNK_TYPE_BARRAY;
            var crc;
            var pos = 0;
            var i;
            
            // length
            chunk[pos++] = (dataLength >> 24) & 0xff;
            chunk[pos++] = (dataLength >> 16) & 0xff;
            chunk[pos++] = (dataLength >>  8) & 0xff;
            chunk[pos++] = (dataLength      ) & 0xff;
            
            // type
            chunk[pos++] = type[0];
            chunk[pos++] = type[1];
            chunk[pos++] = type[2];
            chunk[pos++] = type[3];
            
            // data
            for (i = 0; i < dataLength; ++i) {
                chunk[pos++] = data[i];
            }
            
            //crc
            crc = Zlib.CRC32.calc(type);
            crc = Zlib.CRC32.update(data, crc);
            chunk[pos++] = (crc >> 24) & 0xff;
            chunk[pos++] = (crc >> 16) & 0xff;
            chunk[pos++] = (crc >>  8) & 0xff;
            chunk[pos++] = (crc      ) & 0xff;
            
            return chunk;
        };

        var insertChunk = (buffer:Uint8Array, data:Uint8Array, png:any, rpos:number)=>{
            var chunk = createChunk(data);
            var pos = 0;
            // IDAT チャンクの前までコピー
            buffer.set(png.subarray(0, rpos), pos);
            pos += rpos;
            
            // hoGe チャンクをコピー
            buffer.set(chunk, pos);
            pos += chunk.length;
            
            // IDAT チャンク以降をコピー
            buffer.set(png.subarray(rpos), pos);
            
            return buffer;
        };

        //

        this.process(png, 'IDAT', (png:any, rpos:number, length:number)=>{
            // rpos - 8 = チャンクの開始位置
            insertChunk(embeddedPng, bytearray, png, rpos - 8);
    
            // Uint8Array から bytestring に変換
            var embeddedPngString = "";
            for (var i = 0, il = embeddedPng.length; i < il; ++i) {
                embeddedPngString += String.fromCharCode(embeddedPng[i]);
            }
    
            // Base64 に変換
            var embeddedPngBase64 = window.btoa(embeddedPngString);
            var embeddedPngDataURL = 'data:image/png;base64,' + embeddedPngBase64;

            handler(embeddedPngDataURL);
        });
    }


    public extract(pngDataURL:string):Uint8Array {
        var decoded = window.atob(pngDataURL.split(',', 2).pop());
        // Uint8Array に変換
        var png:Uint8Array = new Uint8Array(
            decoded.split('').map(function(char) {
                return char.charCodeAt(0);
            })
        );
        var rpos:number = 0;
    
        var extractedData = this.process(png, PNGEmbedder.CHUNK_TYPE, (png, rpos, length)=>{
            return (png as any).subarray(rpos, rpos += length);
        });
        return extractedData;
    }

    //

    private process(png:any, type:string, handler:(png:string|ArrayBuffer, rpos:number, dataLength:number)=>any) {
        var dataLength;
        var chunkType;
        var nextChunkPos;
        var Signature = String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10);
        var rpos = 0;
        
        // シグネチャの確認
        if (String.fromCharCode.apply(null, png.subarray(rpos, rpos += 8)) !== Signature) {
            throw new Error('invalid signature');
        }
        
        // チャンクの探索
        while (rpos < png.length) {
            dataLength = (
                (png[rpos++] << 24) |
                (png[rpos++] << 16) |
                (png[rpos++] <<  8) |
                (png[rpos++]      )
            ) >>> 0;
        
            nextChunkPos = rpos + dataLength + 8;
        
            chunkType = String.fromCharCode.apply(null, png.subarray(rpos, rpos += 4));
            
            if (chunkType === type) {
                return handler(png, rpos, dataLength);
            }
            
            rpos = nextChunkPos;
        }
    }
}