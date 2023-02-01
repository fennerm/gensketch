pub fn same_enum_variant<T>(a: &T, b: &T) -> bool {
    std::mem::discriminant(a) == std::mem::discriminant(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_same_enum_variant_false_case() {
        assert!(!same_enum_variant(&Some(1), &None));
    }

    #[test]
    fn test_same_enum_variant_true_case() {
        assert!(same_enum_variant(&Some(1), &Some(2)));
    }
}
