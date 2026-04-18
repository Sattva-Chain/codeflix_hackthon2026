import mongoose from "mongoose";
import comp from "../models/company.js"
import User from "../models/user.js";
import { createTokenForUser, validateToken } from "../services/authentication.js";
import { sendEmployeeCredentialEmail } from "../utils/mail.js";
import Repository from "../models/repo.js";
export const OrgnizationLogin = async (req, res) => {
  try {
    const { emailId, CompanyURL, companyName, pass } = req.body;
    const findUser = await comp.findOne({ emailId: emailId })
    if (!findUser) {
      const CreateCompnay = await comp.create({
        CompanyURL, companyName, pass, emailId
      })
      const token = createTokenForUser(CreateCompnay)
      return res.json({
        success: true,
        message: "Create Account sucessfull",
        tokens: token
      })
    }
    return res.json({
      success: true,
      message: "Company is Alredy Existe"
    })
  } catch (error) {
    res.json({
      success: false,
      message: "network error"
    })
  }
}



export const CompnayAuth = async (req, res) => {
  try {
    const { token } = req.body;
    const user = validateToken(token);

    const companyData = await comp.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(user._id)
        }
      },
      {
        $lookup: {
          from: "users", // ✅ correct collection name (Mongoose makes it plural)
          localField: "_id",
          foreignField: "companyId",
          as: "allEmployees"
        }
      },
      {
        $set: {
          totalEmployees: { $size: "$allEmployees" },
          developersCount: {
            $size: {
              $filter: {
                input: "$allEmployees",
                as: "emp",
                cond: { $eq: ["$$emp.userType", "developer"] }
              }
            }
          }
        }
      }
    ]);

    const row = companyData[0] || {};
    const rawEmployees = row.allEmployees || [];
    const userIds = rawEmployees.map((e) => e._id).filter(Boolean);

    let byUserMap = {};
    let repoTotals = { n: 0, v: 0, u: 0 };

    if (userIds.length > 0) {
      const objectIds = userIds.map((id) =>
        id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)
      );

      const byUserRepos = await Repository.aggregate([
        { $match: { userId: { $in: objectIds } } },
        {
          $group: {
            _id: "$userId",
            lastScanned: { $max: "$LastScanned" },
            repoCount: { $sum: 1 },
            vulnCount: { $sum: { $cond: [{ $eq: ["$Status", "Vulnerable"] }, 1, 0] } }
          }
        }
      ]);
      byUserMap = Object.fromEntries(byUserRepos.map((d) => [d._id.toString(), d]));

      const sumAgg = await Repository.aggregate([
        { $match: { userId: { $in: objectIds } } },
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            v: { $sum: { $ifNull: ["$VerifiedRepositories", 0] } },
            u: { $sum: { $ifNull: ["$UnverifiedRepositories", 0] } }
          }
        }
      ]);
      if (sumAgg[0]) {
        repoTotals = { n: sumAgg[0].n, v: sumAgg[0].v, u: sumAgg[0].u };
      }
    }

    const employees = rawEmployees.map((e) => {
      const id = e._id?.toString?.() ?? String(e._id);
      const r = byUserMap[id];
      const lastScanned = r?.lastScanned ?? null;
      let status = "Pending";
      if (r?.repoCount > 0) {
        status = r.vulnCount > 0 ? "Vulnerable" : "Safe";
      }
      return { ...e, LastScanned: lastScanned, Status: status };
    });

    const vulnerableAccounts = employees.filter((e) => e.Status === "Vulnerable").length;
    const scannedMembersCount = employees.filter((e) => !!e.LastScanned).length;

    const { allEmployees: _omitEmployees, ...companyRest } = row;
    const compnaydatas = {
      ...companyRest,
      employees,
      vulnerableCount: vulnerableAccounts,
      loggedInCount: scannedMembersCount,
      dashboardStats: {
        totalRepositories: repoTotals.n,
        verifiedRepositories: repoTotals.v,
        unverifiedRepositories: repoTotals.u,
        vulnerableAccounts,
        scannedMembersCount
      }
    };

    return res.json({
      success: true,
      message: "Company Data with Employee Counts",
      compnaydatas
    });

  } catch (error) {
    console.log(error);
    return res.json({
      success: false,
      message: "Network Error",
    });
  }
};

export const createEmpy = async (req, res) => {
  try {
    const { employeeEmail, employeePassword, employeeRole, id } = req.body;
     console.log(req.body)
    const findEmploy = await User.findOne({ email: employeeEmail });
    if (findEmploy) {
      return res.status(400).json({
        success: false,
        message: "Employee is already in one Organization",
      });
    }

    await User.create({
      email: employeeEmail,
      role: employeeRole,
      password: employeePassword,
      companyId: id,
    });

    const Organization = await comp.findById(id);
    const name = Organization?.companyName || "Company";

    await sendEmployeeCredentialEmail(employeeEmail, employeeRole, employeePassword, name);

    return res.status(200).json({
      success: true,
      message: "Mail is sent to employee",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

export const getmyemploy = async (req, res) => {
  const { id } = req.body;
  // Basic validation: ensure an ID was provided
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Company ID is required.",
    });
  }

  try {
    // ✅ Use .find() to get an array of all matching employees
    const employees = await User.find({ companyId: id }).populate("companyId");



    // It's good practice to handle the case where no employees are found
    if (!employees || employees.length === 0) {
      return res.json({
        success: true,
        message: "No employees found for this company.",
        datas: [], // Send an empty array
      });
    }

    // Return the array of employees
    return res.json({
      success: true,
      datas: employees, // This will now be an array
    });

  } catch (error) {
    console.log(error);
    // ⚠️ Always send a response back in the catch block
    return res.status(500).json({
      success: false,
      message: "Server error while fetching employees.",
    });
  }
};


export const deletetheProduct = async (req, res) => {
  try {
    const { ids } = req.params
    console.log(ids)
    await User.findByIdAndDelete(ids)
    return res.json({
      success: true,
    })
  } catch (error) {
    return res.json({
      success: false,
    })
  }
}


export const dataAboutEmply = async (req, res) => {
  try {
    const { id } = req.body;
    const employdata = await User.findById(id).populate("companyId")
    const repositories = await Repository.find({ userId: id }).lean();
    return res.json({
      status: true,
      message: "user Logs Found",
      datas: employdata,
      repos: repositories
    })
  } catch (error) {
    console.log(error)
  }

}
export const loginStaff = async (req, res) => {
  try {
    const { emailId, pass } = req.body
    if (!emailId || !pass) {
      return res.status(400).json({ message: "Email & Password required" });
    }
    const existingStaff = await User.findOne({ email: emailId });
    if (!existingStaff) {
      return res.status(404).json({ message: "Email not found" });
    }
    const token = createTokenForUser(existingStaff)
    return res.status(200).json({
      success: true,
      message: "Login Success ✅",
      tokens: token,
    });

  } catch (error) {
    console.log("Login Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const UserAuth = async (req, res) => {
  try {
    const { token } = req.body;
    const userData = validateToken(token);

    if (!userData?._id) {
      return res.json({
        success: false,
        message: "Invalid token",
      });
    }

    const user = await User.findById(userData._id)
      .populate("companyId") // ✅ keep existing population
      .lean(); // ✅ faster response

    if (!user) {
      return res.json({
        success: false,
        message: "User not found",
      });
    }

    const repositories = await Repository.find({ userId: user._id }).lean();
    res.json({
      success: true,
      userDatas: user,
      repositories: repositories || []
    });

  } catch (error) {
    console.log("🔥 Auth Error:", error);
    return res.json({
      success: false,
      message: "Server Error",
    });
  }
};


export const numberkeys = async (req, res) => {
  try {
    const userId = req.user?._id || req.body.userId;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User not logged in" });
    }

    const {
      gitUrl,
      Branch,
      LastScanned,
      Status,
      VerifiedRepositories = 0,
      UnverifiedRepositories = 0,
      TotalSecrets = 0   // ✅ get total secrets from request
    } = req.body;

    if (!gitUrl) {
      return res.status(400).json({ success: false, message: "gitUrl is required" });
    }

    const repoUrl = Array.isArray(gitUrl) ? gitUrl[0] : gitUrl;

    let user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ Find repo for this user
    let repo = await Repository.findOne({ gitUrl: repoUrl, userId });
    let newRepoAdded = false;

    if (repo) {
      // ✅ Update existing repo
      repo.Branch = Branch;
      repo.LastScanned = LastScanned;
      repo.Status = Status;
      repo.VerifiedRepositories = VerifiedRepositories;
      repo.UnverifiedRepositories = UnverifiedRepositories;
      repo.TotalSecrets = TotalSecrets;  // ✅ update total secrets

      await repo.save();
    } else {
      // ✅ Create new repo
      repo = await Repository.create({
        userId,
        gitUrl: repoUrl,
        Branch,
        LastScanned,
        Status,
        VerifiedRepositories,
        UnverifiedRepositories,
        TotalSecrets   // ✅ store total secrets
      });
      console.log(TotalSecrets)
      newRepoAdded = true;

      // ✅ Update user stats only for new repo
      user.TotalRepositories += 1;
      user.VerifiedRepositories += VerifiedRepositories;
      user.UnverifiedRepositories += UnverifiedRepositories;
    }

    await user.save();

    return res.json({
      success: true,
      newRepoAdded,
      message: newRepoAdded
        ? "✅ New repository added"
        : "✅ Existing repository updated",
      user,
      repo
    });

  } catch (error) {
    console.error("🔥 numberkeys Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message
    });
  }
};



export const orgLoginData = async (req, res) => {
  try {
    console.log("Org Login Request:", req.body);

    const { emailId, pass } = req.body;

    if (!emailId || !pass) {
      return res.json({ success: false, message: "All fields required" });
    }

    const datacompany = await comp.findOne({ emailId });

    if (!datacompany) {
      return res.json({ success: false, message: "Company not found" });
    }
    console.log(datacompany.pass)


    if (datacompany.pass != pass) {
      return res.json({
        success: false,
        message: "Invalid password",
      });
    }

    const token = createTokenForUser(datacompany);

    return res.json({
      success: true,
      message: "Login Successfully",
      tokens: token,
    });

  } catch (error) {
    console.log("❌ Org Login Error:", error);
    return res.json({
      success: false,
      message: "Server Error",
    });
  }
};