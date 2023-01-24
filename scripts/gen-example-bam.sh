#!/usr/bin/env bash
# Dependencies:
# * BBtools
# * Samtools
output_fastq="$HOME"/.local/share/gensketch/mtdna_random_reads.fq.gz
output_bam="$HOME"/.local/share/gensketch/mtdna_random_reads.bam
bbmap.sh ref="$HOME"/.local/share/gensketch/human_mtdna.fasta
randomreads.sh \
    reads=4500 \
    length=150 \
    mininsert=350 \
    paired \
    minq=15 \
    midq=30 \
    maxq=40 \
    snprate='0.1' \
    insrate='0.1' \
    delrate='0.1' \
    nrate='0.01' \
    out="$output_fastq"
bbmap.sh in="$output_fastq" out=stdout.bam | samtools sort -o "$output_bam"
samtools index "$output_bam"
