import sys
sys.path.insert(0, '.')

from backend.app.ml_service import train_model

print("Starting training on fan_2 dataset...")
print("Normal:   C:\\keltron project\\6_dB_fan\\fan_2\\normal  (1033 files)")
print("Abnormal: C:\\keltron project\\6_dB_fan\\fan_2\\abnormal (407 files)")
print("Please wait - extracting features and training RandomForest...")
print()

result = train_model(include_local_recordings=False)

m = result['metrics']
print("=" * 50)
print("TRAINING COMPLETE")
print("=" * 50)
print(f"Accuracy:       {m['accuracy']*100:.2f}%")
print(f"Precision:      {m['precision']*100:.2f}%")
print(f"Recall:         {m['recall']*100:.2f}%")
print(f"F1 Score:       {m['f1_score']*100:.2f}%")
print(f"Train samples:  {m['train_samples']}")
print(f"Test samples:   {m['test_samples']}")
print(f"Confusion matrix:")
for label, row in zip(m['labels'], m['confusion_matrix']):
    print(f"  {label}: {row}")
print(f"Note: {m['evaluation_note']}")
print()
meta = result['metadata']
print(f"Trained at: {meta.get('trained_at')}")
print(f"Normal files used:   {meta.get('valid_file_counts', {}).get('NORMAL', '?')}")
print(f"Abnormal files used: {meta.get('valid_file_counts', {}).get('ABNORMAL', '?')}")
print(f"Skipped files: {len(meta.get('skipped_files', []))}")
