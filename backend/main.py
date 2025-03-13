from fastapi import FastAPI
from typing import List
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import json
import daft

load_dotenv("../.env")

client = OpenAI()

app = FastAPI()
users_list = daft.read_parquet("../twitter_users.parquet").to_pydict()
user_interactions_df = daft.read_parquet("../twitter_user_interactions.parquet").collect()

class UserList(BaseModel):
    users: List[str]

@app.get("/")
def ping():
    return {"Hello": "World"}


@app.get("/twitter/users")
def users():
    return users_list

@app.get("/twitter/edges")
def edges():
    return user_interactions_df.select("user1", "user2").to_pydict()

@app.post("/twitter/connections/")
def connections(selected_users: UserList):
    filter_dict = {"user1": [], "user2": []}
    for u1 in selected_users.users:
        for u2 in selected_users.users:
            filter_dict["user1"].append(u1)
            filter_dict["user2"].append(u2)

    filter_df = daft.from_pydict(filter_dict)
    filtered_interactions = user_interactions_df.join(filter_df, how="semi", on=["user1", "user2"]).to_pylist()

    tweets = { user: set() for user in selected_users.users }
    for interaction in filtered_interactions:
        user1 = interaction["user1"]
        user2 = interaction["user2"]
        user1_tweets = interaction["user1_tweets"]
        user2_tweets = interaction["user2_tweets"]

        if user1_tweets is not None:
            tweets[user1].update(user1_tweets)

        if user2_tweets is not None:
            tweets[user2].update(user2_tweets)

    tweets = { k: list(v) for k, v in tweets.items() }
    tweets = json.dumps(tweets, indent=2)
    # instructions = "The following are tweets between a set of users on Twitter, provided as a dictionary where the keys are a username and the values are a list of tweets that user sent.\nGiven these tweets, write a short, high level analysis about what you can derive on how they are connected. The analysis should be in a form similar to \"@user1 ... @user2 ... who ... @user3 ... which ... @user4\"."
    instructions = "The following are tweets between a set of users on Twitter, provided as a dictionary where the keys are a username and the values are a list of tweets that user sent.\nGiven these tweets, write a tweet-length analysis in about how they are connected. The analysis should be in a form similar to \"@user1 ... @user2 ... who ... @user3 ... which ... @user4\"."

    response = client.responses.create(
        model="gpt-4o-mini",
        instructions=instructions,
        input=tweets
    )

    return response.output_text

