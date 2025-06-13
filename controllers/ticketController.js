import Ticket from "../models/Ticket.js";
import cloudinary from "../config/cloudinary.js"; // Import Cloudinary config

const USER_POPULATE_FIELDS = "username firstName lastName email";

// Helper function to upload files to Cloudinary
const uploadFilesToCloudinary = async (files) => {
  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      // Use a unique public_id to avoid overwriting, or let Cloudinary generate it
      // Consider adding a folder structure in Cloudinary e.g., `tickets/${ticketId}/${file.originalname}`
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: "auto", folder: "ticket_attachments" }, // "auto" detects file type
        (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            filename: file.originalname,
          });
        }
      );
      uploadStream.end(file.buffer);
    });
  });
  return Promise.all(uploadPromises);
};

export const createTicket = async (req, res) => {
  try {
    let uploadedAttachments = [];
    if (req.files && req.files.length > 0) {
      uploadedAttachments = await uploadFilesToCloudinary(req.files);
    }

    const ticket = new Ticket({
      title: req.body.title,
      purchase: req.body.purchaseId,
      creator: req.user._id,
      assignedAdmin: null,
      status: "open",
      priority: req.body.priority,
      messages: [
        {
          sender: req.user._id,
          content: req.body.initialMessage,
          attachments: uploadedAttachments,
        },
      ],
    });
    await ticket.save();
    // Populate relevant fields before sending the response
    const populatedTicket = await Ticket.findById(ticket._id)
      .populate("creator", USER_POPULATE_FIELDS)
      .populate("messages.sender", USER_POPULATE_FIELDS)
      .populate("purchase", "orderNumber items totalAmount"); // Or specific fields as needed
    res.status(201).json(populatedTicket);
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(400).json({ error: error.message });
  }
};

export const addMessage = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    let uploadedAttachments = [];
    if (req.files && req.files.length > 0) {
      uploadedAttachments = await uploadFilesToCloudinary(req.files);
    }

    ticket.messages.push({
      sender: req.user._id,
      content: req.body.content,
      attachments: uploadedAttachments,
    });

    await ticket.save();
    // Populate relevant fields before sending the response
    const populatedTicket = await Ticket.findById(ticket._id)
      .populate("creator", USER_POPULATE_FIELDS)
      .populate("assignedAdmin", USER_POPULATE_FIELDS)
      .populate("messages.sender", USER_POPULATE_FIELDS)
      .populate("purchase"); // Or specific fields as needed
    res.json(populatedTicket);
  } catch (error) {
    console.error("Error adding message to ticket:", error);
    res.status(400).json({ error: error.message });
  }
};

export const assignAdmin = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    ticket.assignedAdmin = req.body.adminId;
    ticket.status = "in_progress";
    await ticket.save();
    res.json(ticket);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getTicketThread = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate("creator", USER_POPULATE_FIELDS)
      .populate("assignedAdmin", USER_POPULATE_FIELDS)
      .populate("messages.sender", USER_POPULATE_FIELDS)
      .populate("purchase");
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get tickets based on user role
export const getTickets = async (req, res) => {
  try {
    let query = {};

    // Regular users can only see their own tickets
    if (req.user.role !== "admin") {
      query.creator = req.user._id;
    }

    // Apply filters if provided
    if (req.query.status) query.status = req.query.status;
    if (req.query.priority) query.priority = req.query.priority;

    const tickets = await Ticket.find(query)
      .populate("creator", USER_POPULATE_FIELDS)
      .populate("assignedAdmin", USER_POPULATE_FIELDS)
      .populate("purchase", "orderNumber")
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get user's tickets with purchase details
export const getUserTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({ creator: req.user._id })
      .populate("creator", USER_POPULATE_FIELDS)
      .populate("assignedAdmin", USER_POPULATE_FIELDS)
      .populate("purchase", "orderNumber items totalAmount")
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Validate the new status against the schema enum
    const validStatuses = Ticket.schema.path("status").enumValues;
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    ticket.status = status;

    await ticket.save();
    const populatedTicket = await Ticket.findById(ticket._id)
      .populate("creator", USER_POPULATE_FIELDS)
      .populate("assignedAdmin", USER_POPULATE_FIELDS)
      .populate("messages.sender", USER_POPULATE_FIELDS)
      .populate("purchase");
    res.json(populatedTicket);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
