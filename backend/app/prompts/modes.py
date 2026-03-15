MODE_BEHAVIOR = {
    "teaching": {
        "preferred_order_for_question": ["confused", "genius", "organizer"],
        "preferred_order_for_explanation": ["skeptic", "summarizer", "quiz_master"],
    },
    "exam_prep": {
        "preferred_order_for_question": ["quiz_master", "genius", "skeptic"],
        "preferred_order_for_explanation": ["summarizer", "quiz_master", "organizer"],
    },
    "deep_understanding": {
        "preferred_order_for_question": ["confused", "skeptic", "genius"],
        "preferred_order_for_explanation": ["skeptic", "genius", "summarizer"],
    },
    "quick_review": {
        "preferred_order_for_question": ["summarizer", "quiz_master"],
        "preferred_order_for_explanation": ["organizer", "summarizer"],
    },
}

# After how many turns the Organizer should chime in
ORGANIZER_TRIGGER_INTERVAL = 5