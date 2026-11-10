import json
import os
import uuid

from datetime import datetime


LEADERBOARD_FILE = "leaderboard.json"
HISTORY_FILE = "session_history.json"


def ensure_file_exists(filename):
    """Creates file if it does not exist."""

    if not os.path.exists(filename):

        with open(filename, "w") as file:
            json.dump([], file)


def load_leaderboard():
    """Loads leaderboard data."""

    ensure_file_exists(LEADERBOARD_FILE)

    try:

        with open(
            LEADERBOARD_FILE,
            "r"
        ) as file:

            return json.load(file)

    except json.JSONDecodeError:

        return []


def load_session_history():
    """Loads session history."""

    ensure_file_exists(HISTORY_FILE)

    try:

        with open(
            HISTORY_FILE,
            "r"
        ) as file:

            return json.load(file)

    except json.JSONDecodeError:

        return []


def save_session_history(history):
    """Saves session history."""

    with open(
        HISTORY_FILE,
        "w"
    ) as file:

        json.dump(
            history,
            file,
            indent=4
        )


def save_leaderboard(leaderboard):
    """Saves leaderboard."""

    with open(
        LEADERBOARD_FILE,
        "w"
    ) as file:

        json.dump(
            leaderboard,
            file,
            indent=4
        )


def save_score(
    player_name,
    topic,
    difficulty,
    score,
    accuracy,
    correct_count,
    wrong_count,
    timed_out_count,
    total_questions
):
    """Saves score and session data."""

    leaderboard = load_leaderboard()

    history = load_session_history()

    session_id = str(
        uuid.uuid4()
    )

    entry = {
        "session_id": session_id,
        "player": player_name,
        "topic": topic,
        "difficulty": difficulty,
        "score": score,
        "accuracy": accuracy,
        "correct": correct_count,
        "wrong": wrong_count,
        "timed_out": timed_out_count,
        "questions": total_questions,
        "date": datetime.now().strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    }

    history.append(entry)

    save_session_history(history)

    leaderboard.append(entry)

    leaderboard.sort(
        key=lambda x: x["score"],
        reverse=True
    )

    leaderboard = leaderboard[:10]

    save_leaderboard(leaderboard)

    if leaderboard:

        if (
            leaderboard[0].get("session_id")
            == session_id
        ):

            print(
                "\nNEW HIGH SCORE!"
            )


def display_leaderboard():
    """Displays leaderboard."""

    leaderboard = load_leaderboard()

    if not leaderboard:

        print(
            "\nNo leaderboard data yet."
        )

        return

    print("\n" + "=" * 70)

    print("TOP 10 LEADERBOARD")

    print("=" * 70)

    print(
        f"{'Rank':<6}"
        f"{'Player':<15}"
        f"{'Score':<10}"
        f"{'Accuracy':<12}"
        f"{'Topic':<15}"
    )

    print("-" * 70)

    for index, entry in enumerate(
        leaderboard,
        start=1
    ):

        print(
            f"{index:<6}"
            f"{entry['player']:<15}"
            f"{entry['score']:<10}"
            f"{entry['accuracy']:.2f}%".ljust(12)
            + f"{entry['topic']:<15}"
        )




def get_player_statistics(
    player_name
):
    """Returns player statistics."""

    history = load_session_history()

    player_sessions = [

        session

        for session in history

        if session["player"].lower()
        == player_name.lower()
    ]

    if not player_sessions:

        print(
            "\nNo statistics found."
        )

        return

    games_played = len(
        player_sessions
    )

    highest_score = max(

        session["score"]

        for session in player_sessions
    )

    average_score = (

        sum(
            session["score"]

            for session
            in player_sessions
        )

        / games_played
    )

    average_accuracy = (

        sum(
            session["accuracy"]

            for session
            in player_sessions
        )

        / games_played
    )

    print("\n" + "=" * 50)

    print("PLAYER STATISTICS")

    print("=" * 50)

    print(
        f"Player: {player_name}"
    )

    print(
        f"Games Played: "
        f"{games_played}"
    )

    print(
        f"Highest Score: "
        f"{highest_score}"
    )

    print(
        f"Average Score: "
        f"{average_score:.2f}"
    )

    print(
        f"Average Accuracy: "
        f"{average_accuracy:.2f}%"
    )


def get_badge(
    accuracy
):
    """Returns badge level."""

    if accuracy >= 90:

        return "Gold"

    elif accuracy >= 75:

        return "Silver"

    return "Bronze"


def display_player_badge(
    accuracy
):
    """Displays earned badge."""

    badge = get_badge(
        accuracy
    )

    print(
        f"\nBadge Earned: "
        f"{badge}"
    )

def display_topic_leaderboard(
    topic
):
    """Displays leaderboard by topic."""

    leaderboard = load_leaderboard()

    topic_entries = [

        entry

        for entry in leaderboard

        if entry["topic"] == topic
    ]

    if not topic_entries:

        print(
            "\nNo scores for this topic."
        )

        return

    print(
        f"\n{topic.upper()} LEADERBOARD"
    )

    print("-" * 50)

    for index, entry in enumerate(
        topic_entries,
        start=1
    ):

        print(
            f"{index}. "
            f"{entry['player']} | "
            f"{entry['score']}"
        )