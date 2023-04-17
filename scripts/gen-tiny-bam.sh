#!/usr/bin/env bash
# Dependencies:
# * BBtools
# * Samtools
prefix="fake-genome.tiny"
output_fastq="test_data/$prefix.fq.gz"
output_bam="test_data/$prefix.bam"
unmapped_bam="test_data/$prefix.unmapped.bam"
bbmap.sh ref="test_data/fake-genome.fa"
randomreads.sh \
    reads=10 \
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
samtools view -bhf 4 "$output_bam" | samtools sort -o "$unmapped_bam"
samtools index "$unmapped_bam"
rm "$output_fastq"
rm -rf ref
