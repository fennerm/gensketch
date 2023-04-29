export const randomSequence = ({
  alphabet,
  length,
}: {
  alphabet: string;
  length: number;
}): string => {
  let result = " ";
  const charactersLength = alphabet.length;
  for (let i = 0; i < length; i++) {
    result += alphabet.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
};

export const randomGenomicSequence = (length: number): string => {
  return randomSequence({ length, alphabet: "ACGTN" });
};

export const monkeyPatchBigInt = () => {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    get() {
      "use strict";
      return () => String(this);
    },
  });
};

export function range(start: bigint, end: bigint): bigint[];
export function range(start: number, end: number): number[];
export function range(start: any, end: any): any[] {
  if (typeof start === "bigint" && typeof end === "bigint") {
    return Array.from({ length: Number(end - start) }, (_, i) => BigInt(i) + start);
  } else {
    return Array.from({ length: Number(end - start) }, (_, i) => i + start);
  }
}

export const hexToString = (hex: number): string => {
  let hexString = `${hex.toString(16)}`;
  if (hexString.length < 3) {
    hexString = hexString.padStart(3 - hexString.length, "0");
  }
  hexString = "#" + hexString;
  return hexString;
};

export const isString = (value: unknown): value is string => {
  return typeof value === "string";
};
