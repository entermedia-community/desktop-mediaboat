package org.entermediadb.mediaboat.components;

import java.awt.Color;
import java.awt.Font;
import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;

import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JPasswordField;
import javax.swing.JScrollPane;
import javax.swing.JTextField;
import javax.swing.JTextPane;
import javax.swing.SwingUtilities;
import javax.swing.border.LineBorder;

import org.entermediadb.mediaboat.AppController;
import org.entermediadb.mediaboat.LogListener;

public class LoginForm extends JFrame 
{
	LogListener fieldLogListener;
	public LogListener getLogListener()
	{
		return fieldLogListener;
	}

	public void setLogListener(LogListener inLogListener)
	{
		fieldLogListener = inLogListener;
	}

	JTextField tfusername, tfserver;
	JButton btn1;
	JPasswordField tfkey;
	AppController fieldAppController;
	JTextPane errorlog = new JTextPane();
	
	public AppController getAppController()
	{
		return fieldAppController;
	}

	public void setAppController(AppController inAppController)
	{
		fieldAppController = inAppController;
	}

	public LoginForm()
	{
		setDefaultCloseOperation(EXIT_ON_CLOSE);

		
	}

	public void initContentPanel()
	{
		errorlog.setContentType("text/html");
		SmoothLabel l1, l2, l3, l4;
		l1 = new SmoothLabel("EnterMedia Login");
		l1.setForeground(Color.green);
		
		l1.setFont(new Font("Serif", Font.BOLD, 18));

		l2 = new SmoothLabel("Username");
		l3 = new SmoothLabel("Password");
		l4 = new SmoothLabel("Server");
		tfusername = new JTextField();
		tfusername.setText( getAppController().getConfig().get("username") );
		tfkey = new JPasswordField();
		tfkey.setText( getAppController().getConfig().get("key") );
		tfserver = new JTextField("Server");
		tfserver.setText(getAppController().getConfig().get("server"));
		btn1 = new JButton("Login");
		btn1.addActionListener(new ActionListener()
			{
				@Override
				public void actionPerformed(ActionEvent inE)
				{
					login();
				}
			});
		l1.setBounds(10, 10, 400, 30);
		tfserver.setBounds(200, 150, 300, 30);
		l2.setBounds(80, 70, 200, 30);
		l3.setBounds(80, 110, 200, 30);
		l4.setBounds(80, 150, 200, 30);
		tfusername.setBounds(200, 70, 300, 30);
		tfkey.setBounds(200, 110, 300, 30);
		btn1.setBounds(200, 200, 100, 30);
		JPanel panel = new JPanel();
		panel.setLayout(null);
		panel.add(l1);
		panel.add(tfserver);
		panel.add(l2);
		panel.add(tfusername);
		panel.add(l3);
		panel.add(l4);
		panel.add(tfkey);
		panel.add(btn1);
		setContentPane(panel);

		setVisible(true);

	}

	public void login()
	{
		SwingUtilities.invokeLater(new Runnable()
		{
			public void run()
			{
				String uname = tfusername.getText();
				String pass = tfkey.getText();
				String server  = tfserver.getText();
				showConnectionPanel();
				if (getAppController().connect(server,uname,pass))
				{
//						Welcome wel = new Welcome();
//						wel.setVisible(true);
//						JLabel label = new JLabel("Welcome:" + uname);
//						wel.getContentPane().add(label);
				}
				else
				{
					JOptionPane.showMessageDialog(LoginForm.this, "Incorrect login or password", "Error", JOptionPane.ERROR_MESSAGE);
					showConnectionPanel();
				}
				
			}
		});
	}

	private void showConnectionPanel()
	{
		// TODO Auto-generated method stub
		JPanel panel = new JPanel();
		panel.setLayout(null);
		
		errorlog.setFont(new Font("Serif", Font.BOLD, 11));
		errorlog.setText("Connected\n");
		errorlog.setEditable(false);
		errorlog.setBackground(Color.LIGHT_GRAY);
		final JScrollPane scrolll = new JScrollPane(errorlog);
		scrolll.setBorder(new LineBorder(new Color(128, 128, 128)));
		scrolll.setBounds(0, 0, 600, 240);
		panel.add(scrolll);
		
		btn1 = new JButton("Disconnect");
		btn1.addActionListener(	new ActionListener()
		{
			@Override
			public void actionPerformed(ActionEvent inE)
			{
				logoff();
			}
		});
		
		btn1.setBounds(380, 240, 200, 30);
		panel.add(btn1);
		setContentPane(panel);
		revalidate(); 
		repaint();
	}
	protected void logoff()
	{
		// TODO Auto-generated method stub
		getAppController().logoff();
		
	}

	public void reportError(String inString, Throwable inEx)
	{
		// TODO Auto-generated method stub
		inEx.printStackTrace();
		String text = errorlog.getText();
		if( text.length() > 2000)
		{
			text = text.substring(0,2000);
		}
		errorlog.setText("Error: " + inString + " " + inEx.getMessage() + "\n" + text);
	}

	public void info(String inString)
	{
		String text = errorlog.getText();
		if( text.length() > 2000)
		{
			text = text.substring(0,2000);
		}
		errorlog.setText("\nInfo: " + inString + "\n" + text);
	}

}