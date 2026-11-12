from scripts.model_profile import count_parameters

def test_100m_architecture_count_is_close_to_target():
    count = count_parameters(vocab_size=16000, context=512, dim=768, layers=12)
    assert count == 97_737_216
    assert 95_000_000 <= count <= 100_000_000

def test_parameter_count_increases_with_vocabulary():
    small = count_parameters(8000, 512, 768, 12)
    large = count_parameters(16000, 512, 768, 12)
    assert large - small == 8000 * 768
