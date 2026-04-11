const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { default: User } = require("../models/user");
const {
  createTokenForUser,
  validateToken,
} = require("../services/authentication");
const { OrgnizationLogin, CompnayAuth, createEmpy, getmyemploy, deletetheProduct, dataAboutEmply, loginStaff, UserAuth, numberkeys, orgLoginData } = require("../controller/user");
const SALT_ROUNDS = 10;
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "User name, email, and password required" });
    }
    const exist = await User.findOne({ email });
    if (exist) {
      return res.json({ success: false, error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const createUser = await User.create({ email, password: passwordHash });
    const token = createTokenForUser(createUser);
    createUser.empId = createUser._id.toString();
    await createUser.save();
    return res.json({ success: true, message: "User registered successfully", tokenUser: token });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
router.get("/auth", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("No token provided");
    const tokenUser = authHeader.split(" ")[1]; 

    const payload = validateToken(tokenUser); 
    const userData = await User.findById(payload._id);
    return res.json({
      success: true,
      userData,
    });
  } catch (error) {
    console.error(error);
    res.status(401).json({
      message: "Unauthorized or server error",
    });
  }
});

router.post("/login", async (req, res) => {
  const { empId } = req.body;
  try {
    if (!empId ) {
      return res.status(400).json({ success:false, message: "Email and password required" });
    }
    const user = await User.findById(empId);
    if (!user) {
      return res.status(401).json({ success:false, message: "Invalid email" });
    }
    const token = createTokenForUser(user);
    return res.json({ success:true, message: "Login successful" ,tokenUser:token});
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
router.post("/updateData",async(req,res)=>{
 console.log(req.body)
const { id, gitUrl } = req.body;


const data = await User.findOneAndUpdate(
  { _id: id },         
  { gitUrl: gitUrl },  
  { new: true }        
);
 
 console.log(data)
 res.json({
  success:true,
  message:"datastore"
 })
})
router.post("/logout", async (req, res) => {
  res.clearCookie("token");
});

router.post("/createAcount",OrgnizationLogin)
router.post("/auths",CompnayAuth)
router.post("/createEmpy",createEmpy)
router.post("/getmyemp",getmyemploy)
router.post("/loginStaff",loginStaff)
router.post("/getlogEmploy",dataAboutEmply)
router.post("/authsss",UserAuth)
router.post("/orgLoginData",orgLoginData)
router.post("/numberkeys",numberkeys)
router.post("/deletethaeProduct/:ids",deletetheProduct)
module.exports = router;
