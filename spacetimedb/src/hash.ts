type Hash = string & {length: 32}

const FNV_OFFSET_1 = 0xcbf29ce484222325n;
const FNV_OFFSET_2 = 0x84222325cbf29ce4n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

const hash64 = (value: string, offset: bigint): bigint => {
  let hash = offset;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
};

const toHex64 = (value: bigint) => value.toString(16).padStart(16, "0");

export const hash128 = (...data:any): Hash => {
  const input = JSON.stringify(data);
  const high = hash64(input, FNV_OFFSET_1);
  const low = hash64(input, FNV_OFFSET_2);
  return `${toHex64(high)}${toHex64(low)}` as Hash;
};



