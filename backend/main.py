from fastapi import FastAPI
import daft

app = FastAPI()
users_list = daft.read_parquet("../twitter_users.parquet").to_pydict()
user_interactions_df = daft.read_parquet("../twitter_user_interactions.parquet").collect()

@app.get("/")
def ping():
    return {"Hello": "World"}


@app.get("/twitter/users")
def users():
    return users_list

@app.get("/twitter/edges")
def edges():
    return user_interactions_df.select("user1", "user2").to_pydict()
