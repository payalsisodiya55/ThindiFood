import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongodbUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const listCols = async () => {
  try {
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');
    
    const cols = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:');
    cols.forEach(c => console.log(` - ${c.name}`));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

listCols();
