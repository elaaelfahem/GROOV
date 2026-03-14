MODE_BEHAVIOR = {
    "teaching": {
        "preferred_order_for_question": ["confused", "genius", "skeptic"],
        "preferred_order_for_explanation": ["skeptic", "genius", "summarizer"],
    },
    "exam_prep": {
        "preferred_order_for_question": ["quiz_master", "genius"],
        "preferred_order_for_explanation": ["skeptic", "genius"],
    },
    "deep_understanding": {
        "preferred_order_for_question": ["confused", "genius", "skeptic"],
        "preferred_order_for_explanation": ["skeptic", "genius", "summarizer"],
    },
    "quick_review": {
        "preferred_order_for_question": ["genius", "summarizer"],
        "preferred_order_for_explanation": ["summarizer", "genius"],
    },
}

# After how many turns the Organizer should chime in
ORGANIZER_TRIGGER_INTERVAL = 5