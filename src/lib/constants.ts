/**
 * Constants which are needed throughout the application.
 */
import type { IUPACNucleotide } from "@lib/types";

export const DIVIDER_PX = 2;

export const PRIMARY_IUPAC_NUCLEOTIDES: IUPACNucleotide[] = ["A", "G", "C", "T"];
export const SECONDARY_IUPAC_NUCLEOTIDES: IUPACNucleotide[] = [
  "N",
  "T",
  "R",
  "Y",
  "K",
  "M",
  "S",
  "W",
  "B",
  "D",
  "H",
  "V",
  "GAP",
];
export const IUPAC_NUCLEOTIDES: IUPACNucleotide[] = PRIMARY_IUPAC_NUCLEOTIDES.concat(
  SECONDARY_IUPAC_NUCLEOTIDES
);
