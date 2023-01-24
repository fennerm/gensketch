#!/usr/bin/env python3
from __future__ import annotations
import logging
from pathlib import Path
import random
import shutil
import subprocess
import sys

from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord

OUTDIR = Path("./test/data/")
FASTA_DIR = OUTDIR / "fasta"
FASTQ_DIR = OUTDIR / "fastq"
SAM_DIR = OUTDIR / "sam"
BAM_DIR = OUTDIR / "bam"

DATA_DIRS = [FASTA_DIR, FASTQ_DIR, SAM_DIR, BAM_DIR]

logging.basicConfig(
    stream=sys.stdout, format="%(levelname)s %(asctime)s - %(message)s", level=logging.INFO
)
LOG = logging.getLogger()
SEED = 12345


def gen_rand_seq(length: int, alphabet: str = "ACGTN") -> str:
    return "".join([random.choice(alphabet) for _ in range(length)])


def generate_reference_fasta(
    chrom_length: int = 1000, output_file: Path = FASTA_DIR / "dna.ref.fa"
) -> Path:
    random.seed(SEED)
    LOG.info(f"Generating {output_file}...")
    records = [
        SeqRecord(Seq("G" * chrom_length), id="G", name="", description=""),
        SeqRecord(Seq(gen_rand_seq(chrom_length)), id="Mixed", name="", description=""),
    ]
    SeqIO.write(records, handle=output_file, format="fasta")
    return output_file


def read_fasta(fasta_path: Path) -> dict[str, str]:
    records = {}
    for record in SeqIO.parse(str(fasta_path), "fasta"):
        records[record.id] = record
    return records


def get_random_substring(seq: Seq, length: int) -> str:
    start_pos = random.randint(0, len(seq) - length)
    substr = seq[start_pos : start_pos + length]
    return substr


def gen_random_paired_fastq_names(instrument: str) -> tuple[str, str]:
    flowcell_lane = random.randint(0, 8)
    tile = random.randint(0, 10000)
    x_coord = random.randint(0, 100000)
    y_coord = random.randint(0, 100000)
    id_prefix = f"{instrument}:{flowcell_lane}:{tile}:{x_coord}:{y_coord}:#0/"
    return id_prefix + "1", id_prefix + "2"


def gen_read_pair(seq: Seq, read_length: int, insert_size: int = 100) -> tuple[str, str]:
    fragment_length = (read_length * 2) + insert_size
    fragment_seq = get_random_substring(seq, length=fragment_length)
    fwd = fragment_seq[0: read_length]
    rev = fragment_seq[fragment_length - read_length: fragment_length]
    return fwd, rev


def generate_paired_end_fastq(
    output_file: Path,
    num_pairs: int = 1000,
    read_length: int = 100,
    phred=60,
    reference: Path | None = None,
) -> Path:
    random.seed(SEED)
    LOG.info(f"Generating {output_file}...")
    reads = []
    instrument = "SEQ123"
    phred_qualseq = [phred] * read_length
    refseq = read_fasta(reference) if reference else None
    for _ in range(num_pairs):
        read_names = gen_random_paired_fastq_names(instrument)
        if refseq:
            ref_id = random.choice(list(refseq.keys()))
            sequences = gen_read_pair(refseq[ref_id].seq, read_length=read_length)
        else:
            sequences = (Seq(gen_rand_seq(read_length)), Seq(gen_rand_seq(read_length)))
        for pair in range(2):
            read = SeqRecord(
                sequences[pair],
                id=read_names[pair],
                name=read_names[pair],
                description=read_names[pair],
                letter_annotations={"phred_quality": phred_qualseq},
            )
            reads.append(read)
    SeqIO.write(reads, handle=output_file, format="fastq")
    return output_file


def init_test_directories():
    LOG.info(f"Clearing existing data in {OUTDIR}...")
    shutil.rmtree(OUTDIR)
    LOG.info("Creating test data directories...")
    OUTDIR.mkdir()
    for dir in DATA_DIRS:
        dir.mkdir()


def add_suffix(path: Path, suffix: str) -> Path:
    return Path(str(path) + suffix)


def run_cmd(cmd: list | str) -> str:
    output = subprocess.check_output(cmd).decode("utf-8")
    if output:
        LOG.info(output)
    return output


def index_fasta(fasta_path: Path) -> Path:
    output_file = add_suffix(fasta_path, ".fai")
    run_cmd(["bwa", "index", fasta_path])
    LOG.info(f"Generating {output_file}...")
    run_cmd(["samtools", "faidx", fasta_path])
    return output_file


def index_bam(bam: Path) -> Path:
    output_file = add_suffix(bam, ".bai")
    LOG.info(f"Generating {output_file}...")
    run_cmd(["samtools", "index", bam])
    return output_file


def to_bam(sam: Path) -> Path:
    bam = BAM_DIR / sam.with_suffix(".bam").name
    LOG.info(f"Generating {bam}...")
    run_cmd(["samtools", "view", "-o", bam, "-bSh", sam])
    return bam


def sort_alignments(alignments: Path) -> Path:
    sorted = alignments.with_suffix(f".sorted{alignments.suffix}")
    LOG.info(f"Generating {sorted}...")
    run_cmd(["samtools", "sort", "-o", sorted, alignments])
    return sorted


def align_reads(fastq: Path, fasta: Path) -> Path:
    sam = SAM_DIR / fastq.with_suffix(".sam").name
    LOG.info(f"Generating {sam}...")
    run_cmd(["bwa", "mem", "-o", sam, fasta, fastq])
    return sam


def main():
    init_test_directories()
    reference_fasta = generate_reference_fasta()
    index_fasta(reference_fasta)
    paired_fastq = generate_paired_end_fastq(FASTQ_DIR / "simple.fq", reference=reference_fasta)
    sam = align_reads(fastq=paired_fastq, fasta=reference_fasta)
    sorted_sam = sort_alignments(sam)
    bam = to_bam(sorted_sam)
    index_bam(bam)


if __name__ == "__main__":
    main()
